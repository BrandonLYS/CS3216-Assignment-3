import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import type { PersonRow } from "@/server/modules/people/schema";
import { peopleRepo } from "@/server/modules/people/repository";
import { people } from "@/server/modules/people/schema";
import { peopleService } from "@/server/modules/people/service";
import { projects, type ProjectRow } from "@/server/modules/projects/schema";
import { projectsService } from "@/server/modules/projects/service";
import { risksService } from "@/server/modules/risks/service";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { messagingRepo } from "./repository";
import { roomMessages, roomParticipants, rooms, type RoomRow } from "./schema";

let ctx: Ctx;
let project: ProjectRow;
let jason: PersonRow;
let priya: PersonRow;
let room: RoomRow;

beforeAll(async () => {
  ctx = await makeCtx();
  project = await makeProject(ctx);
  jason = await peopleService.createPerson(ctx, { projectId: project.id, name: "Jason Tan" });
  priya = await peopleService.createPerson(ctx, { projectId: project.id, name: "Priya Nair" });
  room = await messagingRepo.insertRoom(ctx.db, {
    projectId: project.id,
    type: "group",
    name: "Launch",
    createdBy: ctx.userId,
  });
});
afterAll(closeDb);

const say = (text: string | null, over: Partial<Parameters<typeof messagingRepo.insertMessage>[2]> = {}) =>
  messagingRepo.insertMessage(ctx.db, room, {
    text,
    authorPersonId: jason.id,
    authorName: jason.name,
    ...over,
  });

/**
 * Drizzle wraps a failed query, so the constraint name is on the postgres error underneath
 * rather than in the message. Asserting on it proves the *database* refused the row, which is
 * the whole point of these tests: application code is not in the way.
 */
async function expectRejectedBy(promise: Promise<unknown>, constraint: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${constraint} to reject the row`).not.toBeNull();
  const cause = (error as { cause?: { constraint_name?: string } }).cause;
  expect(cause?.constraint_name).toBe(constraint);
}

describe("rooms and participants", () => {
  it("reads a Room back by id and in its Project", async () => {
    expect(await messagingRepo.findRoom(ctx.db, project.id, room.id)).toMatchObject({ name: "Launch", type: "group" });
    expect(await messagingRepo.listRoomsForProject(ctx.db, project.id)).toHaveLength(1);
  });

  it("hides a Room and its history from another Project asking by id", async () => {
    const elsewhere = await makeProject(ctx, "ELS");
    await say("Only for this Project");
    expect(await messagingRepo.findRoom(ctx.db, elsewhere.id, room.id)).toBeUndefined();
    expect(await messagingRepo.listMessages(ctx.db, elsewhere.id, room.id, { limit: 10 })).toEqual([]);
  });

  it("admits a Person once however many times they are added", async () => {
    // The returned rows are the service's only way to tell a real admission from a repeat,
    // and so whether to record an Activity Event.
    expect(await messagingRepo.addParticipant(ctx.db, room.id, jason.id)).toHaveLength(1);
    expect(await messagingRepo.addParticipant(ctx.db, room.id, jason.id)).toEqual([]);
    expect(await messagingRepo.listParticipants(ctx.db, room.id)).toHaveLength(1);
    expect(await messagingRepo.isParticipant(ctx.db, room.id, jason.id)).toBe(true);
  });

  it("shows a Person only the Rooms they were admitted to", async () => {
    const other = await messagingRepo.insertRoom(ctx.db, {
      projectId: project.id,
      type: "group",
      name: "Vendors",
      createdBy: ctx.userId,
    });
    expect(await messagingRepo.isParticipant(ctx.db, other.id, jason.id)).toBe(false);
    const forJason = await messagingRepo.listRoomsForPerson(ctx.db, project.id, jason.id);
    expect(forJason.map((r) => r.name)).toEqual(["Launch"]);
    expect(await messagingRepo.listRoomsForPerson(ctx.db, project.id, priya.id)).toEqual([]);
  });
});

describe("chat message constraints", () => {
  it("accepts text alone and an attachment alone", async () => {
    expect(await say("Gateway is live")).toMatchObject({ text: "Gateway is live" });
    const withFile = await say(null, { attachmentUrl: "/uploads/a.png", mimeType: "image/png" });
    expect(withFile.attachmentUrl).toBe("/uploads/a.png");
  });

  it("rejects a Chat Message with neither text nor attachment", async () => {
    await expectRejectedBy(say(null), "room_messages_content_ck");
  });

  it("rejects an attachment without its MIME type", async () => {
    await expectRejectedBy(say(null, { attachmentUrl: "/uploads/a.png" }), "room_messages_attachment_ck");
  });

  it("rejects a Chat Message attributed to both a Person and a User", async () => {
    await expectRejectedBy(say("Two authors", { authorUserId: ctx.userId }), "room_messages_author_ck");
  });

  it("accepts a Chat Message attributed to neither, which is what a deleted Person leaves", async () => {
    const orphan = await say("No author", { authorPersonId: null, authorName: "Former teammate" });
    expect(orphan.authorPersonId).toBeNull();
    expect(orphan.authorUserId).toBeNull();
  });

  it("takes projectId from the Room rather than the caller", async () => {
    const msg = await say("Scoped");
    expect(msg.projectId).toBe(project.id);
  });

  it("rejects a Chat Message whose projectId disagrees with its Room", async () => {
    const elsewhere = await makeProject(ctx, "OTH");
    await expectRejectedBy(
      ctx.db.insert(roomMessages).values({
        roomId: room.id,
        projectId: elsewhere.id,
        text: "Wrong project",
        authorName: "Jason Tan",
      }),
      "room_messages_room_fk",
    );
  });
});

describe("history", () => {
  it("pages newest first without repeating a row appended between pages", async () => {
    const paged = await messagingRepo.insertRoom(ctx.db, {
      projectId: project.id,
      type: "group",
      name: "Paging",
      createdBy: ctx.userId,
    });
    // Explicit, increasing timestamps. Left to `defaultNow()` these inserts can land in the
    // same millisecond, and the query would then fall back to ordering by their random UUIDs,
    // failing the assertions below for a reason that has nothing to do with paging.
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, i));
    for (let i = 1; i <= 5; i++) {
      await messagingRepo.insertMessage(ctx.db, paged, {
        text: `m${i}`,
        authorPersonId: jason.id,
        authorName: jason.name,
        createdAt: at(i),
      });
    }

    const first = await messagingRepo.listMessages(ctx.db, project.id, paged.id, { limit: 2 });
    expect(first.map((m) => m.text)).toEqual(["m5", "m4"]);

    // A newer Chat Message arrives before the reader scrolls back. A keyset cursor ignores it;
    // an offset would have shifted the window and repeated m3.
    await messagingRepo.insertMessage(ctx.db, paged, {
      text: "m6",
      authorPersonId: jason.id,
      authorName: jason.name,
      createdAt: at(6),
    });

    const last = first.at(-1)!;
    const second = await messagingRepo.listMessages(ctx.db, project.id, paged.id, {
      before: { createdAt: last.createdAt, id: last.id },
      limit: 2,
    });
    expect(second.map((m) => m.text)).toEqual(["m3", "m2"]);
  });

  it("breaks a timestamp tie on id, so a shared instant never repeats or skips a row", async () => {
    const tied = await messagingRepo.insertRoom(ctx.db, {
      projectId: project.id,
      type: "group",
      name: "Tied",
      createdBy: ctx.userId,
    });
    // Three Chat Messages written in the same instant, with ids chosen so their descending
    // order is known: c, b, a. This is the case defaultNow() produces under a burst. The
    // prefix is per-run because `id` is a primary key across every Room, not just this one.
    const sameInstant = new Date(Date.UTC(2026, 0, 2, 9, 0, 0));
    const prefix = randomUUID();
    const ids = ["a", "b", "c"].map((suffix) => `${prefix}-${suffix}`);
    for (const id of ids) {
      await messagingRepo.insertMessage(ctx.db, tied, {
        id,
        text: id,
        authorPersonId: jason.id,
        authorName: jason.name,
        createdAt: sameInstant,
      });
    }
    const [a, b, c] = ids;

    const page1 = await messagingRepo.listMessages(ctx.db, project.id, tied.id, { limit: 2 });
    expect(page1.map((m) => m.id)).toEqual([c, b]);

    const cursor = page1.at(-1)!;
    const page2 = await messagingRepo.listMessages(ctx.db, project.id, tied.id, {
      before: { createdAt: cursor.createdAt, id: cursor.id },
      limit: 2,
    });
    expect(page2.map((m) => m.id)).toEqual([a]);
  });
});

describe("messaging credentials stay on the server", () => {
  it("never returns a password hash from a public Person read", async () => {
    await ctx.db
      .update(people)
      .set({ passwordHash: "hashed-secret", inviteTokenHash: "hashed-token" })
      .where(eq(people.id, priya.id));

    // These are the reads that reach the browser through loadProjectRefs and the Assistant
    // prompt through get_project_summary, so a credential column must not appear in them.
    const listed = await peopleRepo.listByProject(ctx.db, project.id);
    const found = await peopleRepo.findById(ctx.db, priya.id);
    const updated = await peopleRepo.update(ctx.db, priya.id, { role: "Designer" });

    for (const row of [...listed, found, updated]) {
      expect(row).toBeDefined();
      expect(Object.keys(row!)).not.toContain("passwordHash");
      expect(Object.keys(row!)).not.toContain("inviteTokenHash");
    }
  });

  it("never returns a password hash from a Person joined onto another item", async () => {
    await ctx.db.update(people).set({ passwordHash: "hashed-secret" }).where(eq(people.id, jason.id));
    const task = await tasksService.create(ctx, {
      projectId: project.id,
      title: "Ship the gateway",
      priority: "none",
      assigneeId: jason.id,
    });
    const risk = await risksService.create(ctx, {
      projectId: project.id,
      title: "Vendor slips",
      probability: "medium",
      impact: "medium",
      ownerId: jason.id,
    });

    // Task and Risk rows travel to client components and into the Assistant's list_tasks and
    // get_task tools, so their joined Person must be the public projection too.
    const [listedTask] = (await tasksService.list(ctx, project.id)).filter((t) => t.task.id === task.id);
    const [listedRisk] = (await risksService.list(ctx, project.id)).filter((r) => r.risk.id === risk.id);

    expect(listedTask!.assignee).toBeTruthy();
    expect(Object.keys(listedTask!.assignee!)).not.toContain("passwordHash");
    expect(listedRisk!.owner).toBeTruthy();
    expect(Object.keys(listedRisk!.owner!)).not.toContain("passwordHash");
  });

  it("reads credentials only through the login lookup, case-insensitively", async () => {
    await ctx.db
      .update(people)
      .set({ email: "Jason.Tan@Example.com", passwordHash: "hashed-secret" })
      .where(eq(people.id, jason.id));

    const found = await peopleRepo.findCredentialsByEmail(ctx.db, project.id, "jason.tan@example.com");
    expect(found?.passwordHash).toBe("hashed-secret");
    expect(await peopleRepo.findCredentialsByEmail(ctx.db, project.id, "nobody@example.com")).toBeUndefined();
  });

  it("finds the real account when an uninvited Person shares the address", async () => {
    const namesake = await peopleService.createPerson(ctx, { projectId: project.id, name: "Other Jason" });
    // Allowed: neither the index nor the app stops two roster entries sharing an address while
    // only one of them can log in. The lookup must not return this one.
    await ctx.db.update(people).set({ email: "Jason.Tan@Example.com" }).where(eq(people.id, namesake.id));

    const found = await peopleRepo.findCredentialsByEmail(ctx.db, project.id, "jason.tan@example.com");
    expect(found?.id).toBe(jason.id);
    expect(found?.passwordHash).toBe("hashed-secret");
  });

  it("allows two uninvited People to share an email but not two invited ones", async () => {
    const a = await peopleService.createPerson(ctx, { projectId: project.id, name: "Ann Koh" });
    const b = await peopleService.createPerson(ctx, { projectId: project.id, name: "Ben Koh" });
    const shared = "shared@example.com";

    // Always allowed: the roster is a directory, so existing data is never invalidated.
    await ctx.db.update(people).set({ email: shared }).where(eq(people.id, a.id));
    await ctx.db.update(people).set({ email: shared }).where(eq(people.id, b.id));

    // The clash surfaces only when the second of them is invited.
    await ctx.db.update(people).set({ inviteTokenHash: "token-a" }).where(eq(people.id, a.id));
    await expectRejectedBy(
      ctx.db.update(people).set({ inviteTokenHash: "token-b" }).where(eq(people.id, b.id)),
      "people_project_email_uq",
    );
  });
});

describe("what survives a delete", () => {
  it("keeps the Chat Message and its author name when the Person is deleted", async () => {
    const leaver = await peopleService.createPerson(ctx, { projectId: project.id, name: "Wei Ling" });
    const said = await messagingRepo.insertMessage(ctx.db, room, {
      text: "Handing over",
      authorPersonId: leaver.id,
      authorName: leaver.name,
    });

    await ctx.db.delete(people).where(eq(people.id, leaver.id));

    const [after] = await ctx.db.select().from(roomMessages).where(eq(roomMessages.id, said.id));
    expect(after).toMatchObject({ text: "Handing over", authorPersonId: null, authorName: "Wei Ling" });
  });

  it("leaves no Room, Participant or Chat Message behind when the Project is deleted", async () => {
    const doomedCtx = await makeCtx();
    const doomed = await makeProject(doomedCtx, "DOO");
    const person = await peopleService.createPerson(doomedCtx, { projectId: doomed.id, name: "Sam Lee" });
    const r = await messagingRepo.insertRoom(doomedCtx.db, {
      projectId: doomed.id,
      type: "one_to_one",
      createdBy: doomedCtx.userId,
    });
    await messagingRepo.addParticipant(doomedCtx.db, r.id, person.id);
    await messagingRepo.insertMessage(doomedCtx.db, r, {
      text: "Short lived",
      authorPersonId: person.id,
      authorName: person.name,
    });

    await projectsService.delete(doomedCtx, doomed.id);

    expect(await doomedCtx.db.select().from(projects).where(eq(projects.id, doomed.id))).toEqual([]);
    expect(await doomedCtx.db.select().from(rooms).where(eq(rooms.projectId, doomed.id))).toEqual([]);
    expect(await doomedCtx.db.select().from(roomParticipants).where(eq(roomParticipants.roomId, r.id))).toEqual([]);
    expect(await doomedCtx.db.select().from(roomMessages).where(eq(roomMessages.roomId, r.id))).toEqual([]);
  });
});
