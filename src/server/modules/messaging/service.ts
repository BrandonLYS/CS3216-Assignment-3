import type { Ctx } from "@/server/core/context";
import { NotFoundError } from "@/server/core/errors";
import type { DbOrTx } from "@/server/db/client";
import { assertOwnsProject } from "@/server/modules/projects/service";
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
 * The two seams of every read below, in order: the caller owns the Project (ADR 0002), and
 * the Room is in that Project (issue #53). Takes a `DbOrTx` rather than a `Ctx` so the write
 * services of issue #62 can resolve the same way inside `mutate`'s transaction.
 *
 * A Room in another Project is `NotFoundError`, the same as a Room that does not exist:
 * a PM must not learn from the error which Room ids exist in Projects that are not theirs.
 */
async function resolveRoom(db: DbOrTx, userId: string, { projectId, roomId }: RoomRef): Promise<RoomRow> {
  await assertOwnsProject(db, userId, projectId);
  const room = await messagingRepo.findRoom(db, projectId, roomId);
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
};
