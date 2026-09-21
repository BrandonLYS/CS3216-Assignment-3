import type { Ctx } from "@/server/core/context";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { peopleRepo } from "@/server/modules/people/repository";
import { assertPersonInProject } from "@/server/modules/people/service";
import { assertOwnsProject } from "@/server/modules/projects/service";
import type { RoomType } from "@/shared/domain";
import { messagingRepo, type MessageCursor } from "./repository";
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

export const messagingService = {
  listRooms: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return messagingRepo.listRoomsForProject(ctx.db, projectId);
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

  createRoom: (ctx: Ctx, input: { projectId: string; type: RoomType; name?: string | null }) =>
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
      const room = await messagingRepo.insertRoom(tx, {
        projectId: input.projectId,
        type: input.type,
        name,
        createdBy: ctx.userId,
      });
      rec.created("room", room.projectId, room.id, roomLabel(room));
      return room;
    }),

  /** Admitting the same Person twice succeeds and records nothing the second time. */
  addParticipant: (ctx: Ctx, { personId, ...ref }: RoomRef & { personId: string }) =>
    mutate(ctx, async (tx, rec) => {
      // Locked: the one-to-one check below reads the Participants and then writes one, and
      // two admissions racing on the same Room would otherwise both pass the check.
      const room = await resolveRoom(tx, ctx.userId, ref, true);
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
