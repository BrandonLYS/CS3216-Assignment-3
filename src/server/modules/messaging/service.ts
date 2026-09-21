import type { Ctx, ParticipantCtx } from "@/server/core/context";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate, type Recorder } from "@/server/core/mutation";
import type { DbOrTx, Tx } from "@/server/db/client";
import { peopleRepo } from "@/server/modules/people/repository";
import { assertPersonInProject } from "@/server/modules/people/service";
import { projectsRepo } from "@/server/modules/projects/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import type { RoomType } from "@/shared/domain";
import { messagingRepo, type MessageCursor, type RoomParticipantItem } from "./repository";
import type { RoomRow } from "./schema";

/**
 * Upper bound on one page of history, so no caller can ask for a whole Room at once.
 * Not in `src/shared/domain`: that is vocabulary the browser shares, and this is a server
 * limit. The 50-then-20 page sizes the pane actually uses are issue #60.
 */
export const MESSAGE_PAGE_MAX = 100;

type RoomRef = { projectId: string; roomId: string };

/**
 * What a Participant admission is called in the Project's history. The Room is in the
 * snapshot rather than the label because the Person is what the event is about.
 */
export type ParticipantSnapshot = { roomId: string; personId: string; personName: string };

/**
 * A one-to-one Room has no name of its own; the pane labels it by the other Person, whom this
 * service cannot name because Participants are admitted separately (#54 does both at once).
 */
const roomLabel = (room: Pick<RoomRow, "type" | "name">) => room.name ?? "Direct message";

/**
 * The two seams of every read and write below, in order: the caller owns the Project (ADR 0002), and
 * the Room is in that Project (issue #53). Takes a `DbOrTx` rather than a `Ctx` so the write
 * services below resolve the same way inside `mutate`'s transaction.
 *
 * A Room in another Project is `NotFoundError`, the same as a Room that does not exist:
 * a PM must not learn from the error which Room ids exist in Projects that are not theirs.
 */
async function resolveRoom(db: DbOrTx, userId: string, { projectId, roomId }: RoomRef, lock = false): Promise<RoomRow> {
  await assertOwnsProject(db, userId, projectId);
  const room = await messagingRepo.findRoom(db, projectId, roomId, lock);
  if (!room) throw new NotFoundError("Room");
  return room;
}

/**
 * The second authorization seam (ADR 0009), and the mirror of `resolveRoom`: the Person still
 * exists and is still in this Project, the Room is in that Project, and the Person was admitted
 * to it. It is the first line of every service a Participant can reach.
 *
 * The Person is re-read rather than trusted from the cookie, which is what catches a Person
 * deleted or moved since they signed in.
 *
 * Every failure is `NotFoundError("Room")`, never a "forbidden": a Participant must not be able
 * to map the Rooms they are not in.
 */
export async function assertParticipates(
  db: DbOrTx,
  personId: string,
  { projectId, roomId }: RoomRef,
): Promise<RoomRow> {
  const person = await peopleRepo.findById(db, personId);
  if (!person || person.projectId !== projectId) throw new NotFoundError("Room");
  const room = await messagingRepo.findRoom(db, projectId, roomId);
  if (!room) throw new NotFoundError("Room");
  if (!(await messagingRepo.isParticipant(db, room.id, personId))) throw new NotFoundError("Room");
  return room;
}

/**
 * Admit one Person to a Room. Shared by `createRoom` and `addParticipant` so the one-to-one
 * invariant has a single implementation; admitting the same Person twice is a no-op and records
 * nothing. The Room must already be locked by the caller when it might have concurrent writers.
 */
async function admit(tx: Tx, rec: Recorder, room: RoomRow, personId: string) {
  await assertPersonInProject(tx, room.projectId, personId, "personId");
  const person = (await peopleRepo.findById(tx, personId))!;
  if (room.type === "one_to_one") {
    const existing = await messagingRepo.listParticipants(tx, room.id);
    // A repeat admission of the same Person is still a no-op, not an error.
    if (existing.some((p) => p.personId !== personId)) {
      throw new ValidationError("A one-to-one room already has its Person", { personId: ["Not allowed"] });
    }
  }
  const [added] = await messagingRepo.addParticipant(tx, room.id, personId);
  if (!added) return null;
  const snapshot: ParticipantSnapshot = { roomId: room.id, personId, personName: person.name };
  rec.created("participant", room.projectId, personId, person.name, snapshot);
  return added;
}

export const messagingService = {
  listRooms: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return messagingRepo.listRoomsForProject(ctx.db, projectId);
  },

  /**
   * The Rooms of a Project with the People in each, which is what the Room list renders.
   * One query for the Rooms and one for every Participant, never one per Room.
   */
  listRoomsWithParticipants: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const [rooms, participants] = await Promise.all([
      messagingRepo.listRoomsForProject(ctx.db, projectId),
      messagingRepo.listParticipantsForProject(ctx.db, projectId),
    ]);
    const byRoom = new Map<string, RoomParticipantItem[]>();
    for (const { roomId, ...person } of participants) {
      byRoom.set(roomId, [...(byRoom.get(roomId) ?? []), person]);
    }
    return rooms.map((room) => ({ room, participants: byRoom.get(room.id) ?? [] }));
  },

  getRoom: (ctx: Ctx, ref: RoomRef) => resolveRoom(ctx.db, ctx.userId, ref),

  listParticipants: async (ctx: Ctx, ref: RoomRef) => {
    const room = await resolveRoom(ctx.db, ctx.userId, ref);
    return messagingRepo.listParticipants(ctx.db, room.id);
  },

  listMessages: async (ctx: Ctx, ref: RoomRef, page: { before?: MessageCursor; limit: number }) => {
    const room = await resolveRoom(ctx.db, ctx.userId, ref);
    return messagingRepo.listMessages(ctx.db, room.projectId, room.id, {
      before: page.before,
      limit: Math.min(Math.max(page.limit, 1), MESSAGE_PAGE_MAX),
    });
  },

  /** The messaging state of every Person in the Project, for the PM's Participants dialog. */
  listInviteStates: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return peopleRepo.listMessagingStates(ctx.db, projectId);
  },

  /**
   * A Room and the People it exists for, in one transaction. `personIds` is required because a
   * Room with nobody in it is not a conversation: only the PM could see it, and a one-to-one
   * Room would have nothing to be named after. A rejected Room leaves nothing behind.
   */
  createRoom: (ctx: Ctx, input: { projectId: string; type: RoomType; name?: string | null; personIds: string[] }) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      // The schema cannot express this: `rooms.name` is nullable because a one-to-one Room
      // has no name, which leaves a group Room free to have none either.
      const name = input.name?.trim() || null;
      if (input.type === "group" && !name) {
        throw new ValidationError("Room name is required", { name: ["Required"] });
      }
      if (input.type === "one_to_one" && name) {
        throw new ValidationError("A one-to-one room is named by its Person", { name: ["Not allowed"] });
      }
      // Deduplicated here rather than in the schema, so a picker that submits a Person twice is
      // a Room with one Participant instead of an error the PM cannot act on.
      const personIds = [...new Set(input.personIds)];
      if (!personIds.length) throw new ValidationError("Choose who is in this room", { personIds: ["Required"] });
      if (input.type === "one_to_one" && personIds.length > 1) {
        throw new ValidationError("A one-to-one room holds exactly one person", { personIds: ["Choose one person"] });
      }
      const room = await messagingRepo.insertRoom(tx, {
        projectId: input.projectId,
        type: input.type,
        name,
        createdBy: ctx.userId,
      });
      rec.created("room", room.projectId, room.id, roomLabel(room));
      // No row lock: the Room was inserted by this transaction moments ago and its id is not
      // yet known to anyone, so there is no concurrent writer to serialise against.
      for (const personId of personIds) await admit(tx, rec, room, personId);
      return room;
    }),

  /** Admitting the same Person twice succeeds and records nothing the second time. */
  addParticipant: (ctx: Ctx, { personId, ...ref }: RoomRef & { personId: string }) =>
    mutate(ctx, async (tx, rec) => {
      // Locked: the one-to-one check inside `admit` reads the Participants and then writes one,
      // and two admissions racing on the same Room would otherwise both pass the check.
      const room = await resolveRoom(tx, ctx.userId, ref, true);
      return admit(tx, rec, room, personId);
    }),

  /**
   * Written by the PM. A Chat Message from a Person needs a Person session, which arrives
   * with the invite flow (#54) and #55; `authorPersonId` is the column that will carry it.
   */
  postMessage: (ctx: Ctx, { text, ...ref }: RoomRef & { text: string }) =>
    mutate(ctx, async (tx, rec) => {
      const room = await resolveRoom(tx, ctx.userId, ref);
      const body = text.trim();
      // The 4,000-character cap is #57 and attachments are #56; this is only what
      // `room_messages_content_ck` would refuse anyway, raised as a domain error instead.
      if (!body) throw new ValidationError("Message is required", { text: ["Required"] });
      const authorName = await messagingRepo.findAuthorName(tx, ctx.userId);
      if (!authorName) throw new NotFoundError("User");
      const message = await messagingRepo.insertMessage(tx, room, {
        text: body,
        authorUserId: ctx.userId,
        authorName,
      });
      // Published, never persisted (ADR 0010): `room_messages` is already the immutable log
      // an Activity Event would copy, at a volume that would crowd out the Project's history.
      rec.signal("chat_message.created", {
        projectId: room.projectId,
        entityType: "chat_message",
        entityId: message.id,
        // The Room, not the text: a subscriber reads the Chat Message by id.
        entityLabel: roomLabel(room),
        action: "created",
        changes: [],
      });
      return message;
    }),
};

/**
 * What a Person sees of messaging: their own Rooms in their own Project, and nothing else
 * (ADR 0009). Every function starts with `assertParticipates` or is scoped by the Person's own
 * Project id, and none of them can reach `assertOwnsProject`, which has no User to check.
 *
 * Sending is issue #55; this service reads only.
 */
export const participantMessagingService = {
  /**
   * Everything the shell-free Participant page needs: which Project this is, and their Rooms
   * with the People in each. The Project's name comes from `projectsRepo.findName`, because
   * `projectsService.get` proves ownership and a Participant owns nothing.
   */
  workspace: async (pctx: ParticipantCtx) => {
    const { id: personId, projectId } = pctx.person;
    const person = await peopleRepo.findById(pctx.db, personId);
    if (!person || person.projectId !== projectId) throw new NotFoundError("Project");
    const [project, rooms, participants] = await Promise.all([
      projectsRepo.findName(pctx.db, projectId),
      messagingRepo.listRoomsForPerson(pctx.db, projectId, personId),
      messagingRepo.listParticipantsForProject(pctx.db, projectId),
    ]);
    if (!project) throw new NotFoundError("Project");
    const mine = new Set(rooms.map((r) => r.id));
    const byRoom = new Map<string, { personId: string; name: string }[]>();
    for (const p of participants) {
      // Only the Rooms this Person is in, and only the columns the pane renders: the email of
      // the People in a Room is their login identifier and has no business in the browser.
      if (!mine.has(p.roomId)) continue;
      byRoom.set(p.roomId, [...(byRoom.get(p.roomId) ?? []), { personId: p.personId, name: p.name }]);
    }
    return {
      project,
      person: { id: person.id, name: person.name },
      rooms: rooms.map((room) => ({ room, participants: byRoom.get(room.id) ?? [] })),
    };
  },

  listMessages: async (pctx: ParticipantCtx, ref: RoomRef, page: { before?: MessageCursor; limit: number }) => {
    const room = await assertParticipates(pctx.db, pctx.person.id, ref);
    return messagingRepo.listMessages(pctx.db, room.projectId, room.id, {
      before: page.before,
      limit: Math.min(Math.max(page.limit, 1), MESSAGE_PAGE_MAX),
    });
  },
};
