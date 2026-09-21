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
import { messagingRepo } from "./repository";
import type { RoomRow } from "./schema";
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

describe("reading a Room inside its Project", () => {
  it("returns the Room, its Participants and its history newest first", async () => {
    expect(await messagingService.getRoom(ctx, ref())).toMatchObject({ name: "Launch", projectId: project.id });
    expect((await messagingService.listParticipants(ctx, ref())).map((p) => p.name)).toEqual(["Jason Tan"]);
    const history = await messagingService.listMessages(ctx, ref(), { limit: 10 });
    expect(history.map((m) => m.text)).toEqual(["m3", "m2", "m1"]);
  });

  it("lists only the Rooms of the Project asked for", async () => {
    expect((await messagingService.listRooms(ctx, project.id)).map((r) => r.name)).toEqual(["Launch"]);
    expect((await messagingService.listRooms(ctx, sibling.id)).map((r) => r.name)).toEqual(["Sibling"]);
  });

  it("clamps a page size so a caller cannot ask for the whole history", async () => {
    const page = await messagingService.listMessages(ctx, ref(), { limit: MESSAGE_PAGE_MAX + 5_000 });
    expect(page).toHaveLength(3);
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

  it("admits the Person who was admitted to the Room", async () => {
    expect(await assertParticipates(ctx.db, member.id, refTo(theirs))).toMatchObject({ id: theirs.id });
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
    expect(await participantMessagingService.listMessages(pctx, refTo(theirs), { limit: 10 })).toHaveLength(1);
    await expect(
      participantMessagingService.listMessages(pctx, refTo(notTheirs), { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
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
});
