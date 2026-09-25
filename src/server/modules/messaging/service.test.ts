import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx, ParticipantCtx } from "@/server/core/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/core/errors";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { activityRepo } from "@/server/modules/activity/service";
import type { PersonRow } from "@/server/modules/people/schema";
import { peopleService } from "@/server/modules/people/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { messagingRepo, type MessageCursor } from "./repository";
import type { RoomMessageRow, RoomRow } from "./schema";
import {
  assertParticipates,
  MESSAGE_PAGE_MAX,
  messagingService,
  participantMessagingService,
  type ParticipantSnapshot,
} from "./service";

let ctx: Ctx;
let project: ProjectRow;
/** A second Project of the same PM: proves scoping, not ownership. */
let sibling: ProjectRow;
let jason: PersonRow;
let room: RoomRow;
let siblingRoom: RoomRow;

/** A second PM, who owns neither Project: proves ownership. */
let outsider: Ctx;

beforeAll(async () => {
  ctx = await makeCtx();
  project = await makeProject(ctx, "LAU");
  sibling = await makeProject(ctx, "SIB");
  jason = await peopleService.createPerson(ctx, { projectId: project.id, name: "Jason Tan" });
  room = await messagingRepo.insertRoom(ctx.db, {
    projectId: project.id,
    type: "group",
    name: "Launch",
    createdBy: ctx.userId,
  });
  siblingRoom = await messagingRepo.insertRoom(ctx.db, {
    projectId: sibling.id,
    type: "group",
    name: "Sibling",
    createdBy: ctx.userId,
  });
  await messagingRepo.addParticipant(ctx.db, room.id, jason.id);
  for (let i = 1; i <= 3; i++) {
    await messagingRepo.insertMessage(ctx.db, room, {
      text: `m${i}`,
      authorPersonId: jason.id,
      authorName: jason.name,
      createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, i)),
    });
  }
  outsider = await makeCtx();
});
afterAll(closeDb);

const ref = () => ({ projectId: project.id, roomId: room.id });

/** The keyset cursor the pane sends back: the oldest row it has, as a `(createdAt, id)` tuple. */
const cursor = (m: RoomMessageRow): MessageCursor => ({ createdAt: m.createdAt, id: m.id });

describe("reading a Room inside its Project", () => {
  it("returns the Room, its Participants and its history newest first", async () => {
    expect(await messagingService.getRoom(ctx, ref())).toMatchObject({ name: "Launch", projectId: project.id });
    expect((await messagingService.listParticipants(ctx, ref())).map((p) => p.name)).toEqual(["Jason Tan"]);
    const history = await messagingService.listMessages(ctx, ref(), { limit: 10 });
    expect(history.items.map((m) => m.text)).toEqual(["m3", "m2", "m1"]);
    expect(history.hasMore).toBe(false);
  });

  it("lists only the Rooms of the Project asked for", async () => {
    expect((await messagingService.listRooms(ctx, project.id)).map((r) => r.name)).toEqual(["Launch"]);
    expect((await messagingService.listRooms(ctx, sibling.id)).map((r) => r.name)).toEqual(["Sibling"]);
  });

  it("clamps a page size so a caller cannot ask for the whole history", async () => {
    const page = await messagingService.listMessages(ctx, ref(), { limit: MESSAGE_PAGE_MAX + 5_000 });
    expect(page.items).toHaveLength(3);
  });

  /** Issue #60: the pane asks for a page at a time and needs to know when to stop asking. */
  it("reports older history only while there is some", async () => {
    const first = await messagingService.listMessages(ctx, ref(), { limit: 2 });
    expect(first.items.map((m) => m.text)).toEqual(["m3", "m2"]);
    expect(first.hasMore).toBe(true);

    const second = await messagingService.listMessages(ctx, ref(), { limit: 2, before: cursor(first.items.at(-1)!) });
    expect(second.items.map((m) => m.text)).toEqual(["m1"]);
    expect(second.hasMore).toBe(false);
  });

  it("walks the whole history in pages, with no duplicate and no gap", async () => {
    // `text` is nullable because a Chat Message may be an attachment alone (#56).
    const seen: (string | null)[] = [];
    let before: MessageCursor | undefined;
    // Bounded so a bug that never lowers the cursor fails as an assertion, not a hung suite.
    for (let guard = 0; guard < 10; guard++) {
      const page = await messagingService.listMessages(ctx, ref(), { limit: 2, before });
      seen.push(...page.items.map((m) => m.text));
      if (!page.hasMore) break;
      before = cursor(page.items.at(-1)!);
    }
    expect(seen).toEqual(["m3", "m2", "m1"]);
  });

  it("answers an exhausted or unrecognised cursor with an empty last page", async () => {
    const pastTheBeginning = { createdAt: new Date(Date.UTC(2000, 0, 1)), id: randomUUID() };
    expect(await messagingService.listMessages(ctx, ref(), { limit: 10, before: pastTheBeginning })).toEqual({
      items: [],
      hasMore: false,
    });
  });
});

/** Issue #59: what an open pane asks for on a timer to learn what the other side said. */
describe("catching up on a Room", () => {
  const beginning = { createdAt: new Date(Date.UTC(2000, 0, 1)), id: randomUUID() };

  it("returns what was written after the cursor, oldest first", async () => {
    const whole = await messagingService.listMessages(ctx, ref(), { limit: 10 });
    const middle = cursor(whole.items[1]!); // m2
    const since = await messagingService.messagesSince(ctx, ref(), { after: middle, limit: 10 });
    expect(since.items.map((m) => m.text)).toEqual(["m3"]);
    expect(since.truncated).toBe(false);
  });

  it("says nothing new when the cursor is the newest Chat Message", async () => {
    const whole = await messagingService.listMessages(ctx, ref(), { limit: 10 });
    const since = await messagingService.messagesSince(ctx, ref(), { after: cursor(whole.items[0]!), limit: 10 });
    expect(since).toEqual({ items: [], truncated: false });
  });

  /**
   * `truncated` is the pane's signal to stop merging and start again from the newest page:
   * the rows it did not get are above the ones it did, so merging would leave a hole.
   */
  it("truncates a catch-up larger than the batch, and still returns the batch", async () => {
    const since = await messagingService.messagesSince(ctx, ref(), { after: beginning, limit: 2 });
    expect(since.items.map((m) => m.text)).toEqual(["m1", "m2"]);
    expect(since.truncated).toBe(true);
  });

  it("clamps the batch so a caller cannot ask for the whole Room", async () => {
    const since = await messagingService.messagesSince(ctx, ref(), {
      after: beginning,
      limit: MESSAGE_PAGE_MAX + 5000,
    });
    expect(since.items).toHaveLength(3);
    expect(since.truncated).toBe(false);
  });

  it("refuses a Room in another Project, and a PM who owns neither", async () => {
    await expect(
      messagingService.messagesSince(ctx, { projectId: sibling.id, roomId: room.id }, { after: beginning, limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      messagingService.messagesSince(outsider, ref(), { after: beginning, limit: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("reaching across the seams", () => {
  /** The PM owns both Projects, so only the Room scoping can refuse this. */
  it("does not find a Room of another Project of the same PM", async () => {
    const wrongProject = { projectId: sibling.id, roomId: room.id };
    await expect(messagingService.getRoom(ctx, wrongProject)).rejects.toBeInstanceOf(NotFoundError);
    await expect(messagingService.listParticipants(ctx, wrongProject)).rejects.toBeInstanceOf(NotFoundError);
    await expect(messagingService.listMessages(ctx, wrongProject, { limit: 10 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not find a Room that does not exist, with the same error", async () => {
    await expect(
      messagingService.getRoom(ctx, { projectId: project.id, roomId: "no-such-room" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /** Forbidden, not NotFound: the Project check runs first and never reveals the Room. */
  it("refuses every read to a PM who does not own the Project", async () => {
    await expect(messagingService.listRooms(outsider, project.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(messagingService.getRoom(outsider, ref())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(messagingService.listParticipants(outsider, ref())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(messagingService.listMessages(outsider, ref(), { limit: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      messagingService.getRoom(outsider, { projectId: project.id, roomId: siblingRoom.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/** A Project of its own, so these writes cannot disturb the read assertions above. */
describe("writing through mutate", () => {
  let writeProject: ProjectRow;
  let priya: PersonRow;
  let wei: PersonRow;

  /** An explicit limit well above the default 50, so counting rows cannot hit the page size. */
  const eventsOf = (projectId: string) => activityRepo.recentForProject(ctx.db, projectId, 500);

  beforeAll(async () => {
    writeProject = await makeProject(ctx, "WRT");
    priya = await peopleService.createPerson(ctx, { projectId: writeProject.id, name: "Priya Nair" });
    wei = await peopleService.createPerson(ctx, { projectId: writeProject.id, name: "Wei Ling" });
  });

  const group = (name = "Launch plan", personIds: string[] = [priya.id]) =>
    messagingService.createRoom(ctx, { projectId: writeProject.id, type: "group", name, personIds });

  const direct = (personIds: string[] = [priya.id]) =>
    messagingService.createRoom(ctx, { projectId: writeProject.id, type: "one_to_one", personIds });

  it("records a created Activity Event for a Room", async () => {
    const created = await group("Vendor sync");
    expect(created).toMatchObject({ projectId: writeProject.id, name: "Vendor sync", createdBy: ctx.userId });

    const event = (await eventsOf(writeProject.id)).map((e) => e.event).find((e) => e.entityId === created.id);
    expect(event).toMatchObject({ entityType: "room", action: "created", entityLabel: "Vendor sync" });
  });

  it("requires a name for a group Room and refuses one for a one-to-one Room", async () => {
    await expect(group("   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(
      messagingService.createRoom(ctx, {
        projectId: writeProject.id,
        type: "one_to_one",
        name: "Priya",
        personIds: [priya.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const solo = await direct();
    expect(solo.name).toBeNull();
    const event = (await eventsOf(writeProject.id)).map((e) => e.event).find((e) => e.entityId === solo.id);
    expect(event?.entityLabel).toBe("Direct message");
  });

  it("records the admission of a Person once, however many times they are admitted", async () => {
    const created = await group("Admissions", [wei.id]);
    const ref = { projectId: writeProject.id, roomId: created.id };

    const added = await messagingService.addParticipant(ctx, { ...ref, personId: priya.id });
    expect(added).toMatchObject({ roomId: created.id, personId: priya.id });
    expect(await messagingService.addParticipant(ctx, { ...ref, personId: priya.id })).toBeNull();

    // Wei Ling was admitted when the Room was created, Priya once afterwards despite two calls.
    expect((await messagingService.listParticipants(ctx, ref)).map((p) => p.name)).toEqual(["Priya Nair", "Wei Ling"]);
    const events = (await eventsOf(writeProject.id))
      .map((e) => e.event)
      // Scoped to this Room: Priya is admitted to other Rooms by other tests in this block.
      .filter(
        (e) =>
          e.entityType === "participant" &&
          e.entityId === priya.id &&
          (e.newValue as ParticipantSnapshot)?.roomId === created.id,
      );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "created", entityLabel: "Priya Nair", entityId: priya.id });
    expect(events[0]!.newValue).toMatchObject({ roomId: created.id, personId: priya.id, personName: "Priya Nair" });
  });

  /** CONTEXT.md defines a one-to-one Room as the PM and a single Person. */
  it("admits one Person to a one-to-one Room and no more", async () => {
    const room = await direct();
    const ref = { projectId: writeProject.id, roomId: room.id };
    const other = wei;

    // Re-admitting the same Person stays a no-op rather than becoming an error.
    expect(await messagingService.addParticipant(ctx, { ...ref, personId: priya.id })).toBeNull();
    await expect(messagingService.addParticipant(ctx, { ...ref, personId: other.id })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await messagingService.listParticipants(ctx, ref)).toHaveLength(1);
  });

  it("refuses a Person from another Project", async () => {
    const created = await group("Outsiders");
    await expect(
      messagingService.addParticipant(ctx, { projectId: writeProject.id, roomId: created.id, personId: jason.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores a Chat Message with the PM as its author", async () => {
    const created = await group("Author");
    const message = await messagingService.postMessage(ctx, {
      projectId: writeProject.id,
      roomId: created.id,
      text: "  Gateway is live  ",
    });
    expect(message).toMatchObject({
      text: "Gateway is live",
      projectId: writeProject.id,
      authorUserId: ctx.userId,
      authorPersonId: null,
      authorName: "Test User",
    });
    await expect(
      messagingService.postMessage(ctx, { projectId: writeProject.id, roomId: created.id, text: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  /** ADR 0010: the Chat Message is its own log, so the event is published and not persisted. */
  it("publishes chat_message.created without writing an Activity Event", async () => {
    const created = await group("Signals");
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("chat_message.created", (e) => void received.push(e));
    const before = (await eventsOf(writeProject.id)).length;
    const message = await messagingService.postMessage(ctx, {
      projectId: writeProject.id,
      roomId: created.id,
      text: "No activity row for this",
    });
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      name: "chat_message.created",
      action: "created",
      entityType: "chat_message",
      entityId: message.id,
      entityLabel: "Signals",
      projectId: writeProject.id,
      actorId: ctx.userId,
    });
    expect(received[0]!.entityLabel).not.toContain("No activity row");
    expect((await eventsOf(writeProject.id)).length).toBe(before);
  });

  it("creates a Room and admits its People in one transaction", async () => {
    const created = await group("Kickoff", [priya.id, wei.id, priya.id]);
    const ref = { projectId: writeProject.id, roomId: created.id };
    // The repeated id is deduplicated rather than rejected: a picker that submits a Person
    // twice should make a Room, not an error the PM cannot act on.
    expect((await messagingService.listParticipants(ctx, ref)).map((p) => p.name)).toEqual(["Priya Nair", "Wei Ling"]);
    const admissions = (await eventsOf(writeProject.id))
      .map((e) => e.event)
      .filter((e) => e.entityType === "participant" && (e.newValue as ParticipantSnapshot)?.roomId === created.id);
    expect(admissions).toHaveLength(2);
  });

  it("leaves no Room behind when the People it was created for are refused", async () => {
    const before = await messagingService.listRooms(ctx, writeProject.id);
    await expect(
      messagingService.createRoom(ctx, {
        projectId: writeProject.id,
        type: "one_to_one",
        personIds: [priya.id, wei.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // A Person from another Project is refused by `admit` after the Room row is already
    // inserted, which is the case the single transaction exists for.
    await expect(
      messagingService.createRoom(ctx, {
        projectId: writeProject.id,
        type: "group",
        name: "Rollback",
        personIds: [jason.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      messagingService.createRoom(ctx, { projectId: writeProject.id, type: "group", name: "Empty", personIds: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await messagingService.listRooms(ctx, writeProject.id)).toHaveLength(before.length);
  });

  it("refuses every write to a PM who does not own the Project, and every Room in another Project", async () => {
    const created = await group("Guarded");
    const owned = { projectId: writeProject.id, roomId: created.id };
    await expect(
      messagingService.createRoom(outsider, {
        projectId: writeProject.id,
        type: "group",
        name: "Theirs",
        personIds: [priya.id],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(messagingService.addParticipant(outsider, { ...owned, personId: priya.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(messagingService.postMessage(outsider, { ...owned, text: "Hello" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const elsewhere = { projectId: sibling.id, roomId: created.id };
    await expect(messagingService.addParticipant(ctx, { ...elsewhere, personId: priya.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(messagingService.postMessage(ctx, { ...elsewhere, text: "Hello" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

/** The second seam of ADR 0009: what a Person sees, and what they must not. */
describe("the Participant path", () => {
  let project2: ProjectRow;
  let member: PersonRow;
  let bystander: PersonRow;
  let theirs: RoomRow;
  let notTheirs: RoomRow;
  let pctx: ParticipantCtx;

  beforeAll(async () => {
    project2 = await makeProject(ctx, "PAR");
    member = await peopleService.createPerson(ctx, { projectId: project2.id, name: "Mei Chen" });
    bystander = await peopleService.createPerson(ctx, { projectId: project2.id, name: "Tomas Alva" });
    theirs = await messagingService.createRoom(ctx, {
      projectId: project2.id,
      type: "group",
      name: "Theirs",
      personIds: [member.id],
    });
    notTheirs = await messagingService.createRoom(ctx, {
      projectId: project2.id,
      type: "group",
      name: "Not theirs",
      personIds: [bystander.id],
    });
    await messagingService.postMessage(ctx, { projectId: project2.id, roomId: theirs.id, text: "Welcome" });
    pctx = { db: ctx.db, person: { id: member.id, projectId: project2.id } };
  });

  const refTo = (room: RoomRow) => ({ projectId: project2.id, roomId: room.id });

  it("admits the Person who was admitted to the Room, and hands back both rows", async () => {
    expect(await assertParticipates(ctx.db, member.id, refTo(theirs))).toMatchObject({
      room: { id: theirs.id },
      person: { id: member.id, name: "Mei Chen" },
    });
  });

  it("refuses everyone else with NotFound, so no Room can be probed", async () => {
    // Thunks, not promises: a rejected promise built before its `await` is an unhandled one.
    const refusals = [
      () => assertParticipates(ctx.db, bystander.id, refTo(theirs)),
      () => assertParticipates(ctx.db, jason.id, refTo(theirs)),
      () => assertParticipates(ctx.db, member.id, { ...refTo(theirs), projectId: sibling.id }),
      () => assertParticipates(ctx.db, randomUUID(), refTo(theirs)),
    ];
    for (const attempt of refusals) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shows a Person their own Rooms, their Project's name, and no email addresses", async () => {
    const view = await participantMessagingService.workspace(pctx);
    expect(view.project).toEqual({ id: project2.id, name: project2.name });
    expect(view.rooms.map((r) => r.room.id)).toEqual([theirs.id]);
    expect(view.rooms[0]!.participants).toEqual([{ personId: member.id, name: "Mei Chen" }]);
    expect(JSON.stringify(view)).not.toContain("@");
  });

  it("reads the history of a Room they are in and refuses one they are not", async () => {
    expect((await participantMessagingService.listMessages(pctx, refTo(theirs), { limit: 10 })).items).toHaveLength(1);
    await expect(
      participantMessagingService.listMessages(pctx, refTo(notTheirs), { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /** Issue #59, from the other side of ADR 0009: the same catch-up, behind the other seam. */
  describe("catching up", () => {
    let caught: RoomRow;
    let caughtRef: { projectId: string; roomId: string };
    const beginning = { createdAt: new Date(Date.UTC(2000, 0, 1)), id: randomUUID() };

    beforeAll(async () => {
      caught = await messagingService.createRoom(ctx, {
        projectId: project2.id,
        type: "group",
        name: "Catching up",
        personIds: [member.id],
      });
      caughtRef = refTo(caught);
    });

    /** The whole feature in one test: each audience sees what the other just wrote. */
    it("hands a Person what the PM wrote after their cursor, and the reverse", async () => {
      const opened = await participantMessagingService.listMessages(pctx, caughtRef, { limit: 10 });
      expect(opened.items).toEqual([]);

      const fromPm = await messagingService.postMessage(ctx, { ...caughtRef, text: "Standup at ten" });
      const forMember = await participantMessagingService.messagesSince(pctx, caughtRef, {
        after: beginning,
        limit: 10,
      });
      expect(forMember.items.map((m) => m.text)).toEqual(["Standup at ten"]);
      expect(forMember.truncated).toBe(false);

      await participantMessagingService.postMessage(pctx, { ...caughtRef, text: "See you there" });
      const forPm = await messagingService.messagesSince(ctx, caughtRef, { after: cursor(fromPm), limit: 10 });
      expect(forPm.items.map((m) => m.text)).toEqual(["See you there"]);
    });

    it("refuses a Room the Person was not admitted to", async () => {
      await expect(
        participantMessagingService.messagesSince(pctx, refTo(notTheirs), { after: beginning, limit: 10 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("refuses a Person who no longer exists", async () => {
      const deleted: ParticipantCtx = { db: ctx.db, person: { id: randomUUID(), projectId: project2.id } };
      await expect(
        participantMessagingService.messagesSince(deleted, caughtRef, { after: beginning, limit: 10 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("refuses a Person whose row moved to another Project since they signed in", async () => {
    const moved = await peopleService.createPerson(ctx, { projectId: project2.id, name: "Moved Person" });
    await messagingService.addParticipant(ctx, { ...refTo(theirs), personId: moved.id });
    const stale: ParticipantCtx = { db: ctx.db, person: { id: moved.id, projectId: sibling.id } };
    await expect(participantMessagingService.workspace(stale)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      participantMessagingService.listMessages(stale, { projectId: sibling.id, roomId: theirs.id }, { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /** Issue #55. Its own Room, so the history assertions above stay exact. */
  describe("sending", () => {
    let sendable: RoomRow;
    let sendRef: { projectId: string; roomId: string };

    beforeAll(async () => {
      sendable = await messagingService.createRoom(ctx, {
        projectId: project2.id,
        type: "group",
        name: "Sendable",
        personIds: [member.id],
      });
      sendRef = refTo(sendable);
    });

    it("stores a Chat Message with the Person as its author, where the PM can read it", async () => {
      const message = await participantMessagingService.postMessage(pctx, { ...sendRef, text: "  On it  " });
      expect(message).toMatchObject({
        text: "On it",
        projectId: project2.id,
        authorPersonId: member.id,
        authorUserId: null,
        authorName: "Mei Chen",
      });
      const asPm = await messagingService.listMessages(ctx, sendRef, { limit: 10 });
      expect(asPm.items.map((m) => m.text)).toContain("On it");
    });

    /** ADR 0010, and the Participant half of it: the signal carries no actor at all. */
    it("publishes chat_message.created with a null actor and writes no Activity Event", async () => {
      const received: DomainEvent[] = [];
      const unsub = eventBus.subscribe("chat_message.created", (e) => void received.push(e));
      const before = (await activityRepo.recentForProject(ctx.db, project2.id, 500)).length;
      const message = await participantMessagingService.postMessage(pctx, {
        ...sendRef,
        text: "No activity row for this either",
      });
      unsub();

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        name: "chat_message.created",
        action: "created",
        entityType: "chat_message",
        entityId: message.id,
        entityLabel: "Sendable",
        projectId: project2.id,
        actorId: null,
      });
      expect(received[0]!.entityLabel).not.toContain("No activity row");
      expect((await activityRepo.recentForProject(ctx.db, project2.id, 500)).length).toBe(before);
    });

    it("refuses an empty body and writes nothing", async () => {
      const before = await participantMessagingService.listMessages(pctx, sendRef, { limit: 100 });
      await expect(participantMessagingService.postMessage(pctx, { ...sendRef, text: "   " })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect((await participantMessagingService.listMessages(pctx, sendRef, { limit: 100 })).items).toHaveLength(
        before.items.length,
      );
    });

    it("refuses everyone who is not in the Room, with NotFound", async () => {
      const bystanderCtx: ParticipantCtx = { db: ctx.db, person: { id: bystander.id, projectId: project2.id } };
      const strangerCtx: ParticipantCtx = { db: ctx.db, person: { id: randomUUID(), projectId: project2.id } };
      // Thunks, not promises: a rejected promise built before its `await` is an unhandled one.
      const refusals = [
        // In the Project, not in this Room.
        () => participantMessagingService.postMessage(bystanderCtx, { ...sendRef, text: "Let me in" }),
        // In this Room, aiming at one they are not in.
        () => participantMessagingService.postMessage(pctx, { ...refTo(notTheirs), text: "Let me in" }),
        // In this Room, naming another Project.
        () =>
          participantMessagingService.postMessage(pctx, {
            projectId: sibling.id,
            roomId: sendable.id,
            text: "Let me in",
          }),
        () => participantMessagingService.postMessage(strangerCtx, { ...sendRef, text: "Let me in" }),
      ];
      for (const attempt of refusals) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  /** Issue #60, through the second seam: a Person pages back through their own Room. */
  describe("paging", () => {
    let deep: RoomRow;
    let deepRef: { projectId: string; roomId: string };

    beforeAll(async () => {
      deep = await messagingService.createRoom(ctx, {
        projectId: project2.id,
        type: "group",
        name: "Deep",
        personIds: [member.id],
      });
      deepRef = refTo(deep);
      // Its own Room, so the counts here cannot be disturbed by the sending tests above.
      for (const text of ["p1", "p2", "p3", "p4"]) {
        await participantMessagingService.postMessage(pctx, { ...deepRef, text });
      }
    });

    it("walks a Person's own history in pages that match reading it in one", async () => {
      // Compared against the single-page read rather than against insertion order: four writes
      // can land in the same millisecond, and then `(created_at, id)` - not arrival - is the
      // order, for the pages and the whole alike.
      const whole = await participantMessagingService.listMessages(pctx, deepRef, { limit: 100 });
      expect(whole.items).toHaveLength(4);

      const seen: string[] = [];
      let before: MessageCursor | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const page = await participantMessagingService.listMessages(pctx, deepRef, { limit: 2, before });
        seen.push(...page.items.map((m) => m.id));
        if (!page.hasMore) break;
        before = cursor(page.items.at(-1)!);
      }
      expect(seen).toEqual(whole.items.map((m) => m.id));
    });

    it("refuses a cursor into a Room the Person is not in", async () => {
      const bystanderCtx: ParticipantCtx = { db: ctx.db, person: { id: bystander.id, projectId: project2.id } };
      await expect(
        participantMessagingService.listMessages(bystanderCtx, deepRef, {
          limit: 2,
          before: { createdAt: new Date(), id: randomUUID() },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
