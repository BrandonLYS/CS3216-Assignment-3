import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, NotFoundError } from "@/server/core/errors";
import type { PersonRow } from "@/server/modules/people/schema";
import { peopleService } from "@/server/modules/people/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { messagingRepo } from "./repository";
import type { RoomRow } from "./schema";
import { MESSAGE_PAGE_MAX, messagingService } from "./service";

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
