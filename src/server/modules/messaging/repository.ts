import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { people } from "@/server/modules/people/schema";
import {
  roomMessages,
  roomParticipants,
  rooms,
  type NewRoomMessageRow,
  type NewRoomRow,
  type RoomMessageRow,
  type RoomRow,
} from "./schema";

/** Where a page of history stopped. Keyset, not offset: a Room is appended to while it is read. */
export type MessageCursor = { createdAt: Date; id: string };

export const messagingRepo = {
  insertRoom: async (db: DbOrTx, values: NewRoomRow): Promise<RoomRow> => {
    const [row] = await db.insert(rooms).values(values).returning();
    return row!;
  },

  findRoomById: async (db: DbOrTx, id: string): Promise<RoomRow | undefined> => {
    const [row] = await db.select().from(rooms).where(eq(rooms.id, id));
    return row;
  },

  listRoomsForProject: (db: DbOrTx, projectId: string): Promise<RoomRow[]> =>
    db.select().from(rooms).where(eq(rooms.projectId, projectId)).orderBy(asc(rooms.createdAt), asc(rooms.id)),

  /** The Rooms one Person was admitted to; the whole of what they may see (ADR 0009). */
  listRoomsForPerson: (db: DbOrTx, projectId: string, personId: string): Promise<RoomRow[]> =>
    db
      .select({ room: rooms })
      .from(rooms)
      .innerJoin(roomParticipants, eq(roomParticipants.roomId, rooms.id))
      .where(and(eq(rooms.projectId, projectId), eq(roomParticipants.personId, personId)))
      .orderBy(asc(rooms.createdAt), asc(rooms.id))
      .then((xs) => xs.map((x) => x.room)),

  /** Admitting the same Person twice is a no-op, so callers need not check first. */
  addParticipant: (db: DbOrTx, roomId: string, personId: string) =>
    db.insert(roomParticipants).values({ roomId, personId }).onConflictDoNothing(),

  listParticipants: (db: DbOrTx, roomId: string) =>
    db
      .select({ personId: people.id, name: people.name, email: people.email, addedAt: roomParticipants.addedAt })
      .from(roomParticipants)
      .innerJoin(people, eq(people.id, roomParticipants.personId))
      .where(eq(roomParticipants.roomId, roomId))
      .orderBy(asc(people.name)),

  isParticipant: (db: DbOrTx, roomId: string, personId: string): Promise<boolean> =>
    db
      .select({ one: sql<number>`1` })
      .from(roomParticipants)
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.personId, personId)))
      .limit(1)
      .then((xs) => xs.length > 0),

  /**
   * `projectId` is taken from the Room, never from the caller, so the denormalised column
   * cannot disagree with it. Throws if the Room is gone.
   */
  insertMessage: async (
    db: DbOrTx,
    roomId: string,
    values: Omit<NewRoomMessageRow, "roomId" | "projectId">,
  ): Promise<RoomMessageRow> => {
    const room = await messagingRepo.findRoomById(db, roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const [row] = await db
      .insert(roomMessages)
      .values({ ...values, roomId, projectId: room.projectId })
      .returning();
    return row!;
  },

  /**
   * Newest first, which is the order the pane renders and the order #60 pages through.
   * `before` is the oldest row already shown; the tuple comparison is what keeps a page
   * from repeating or skipping a row when one is appended between two fetches.
   */
  listMessages: (
    db: DbOrTx,
    roomId: string,
    { before, limit }: { before?: MessageCursor; limit: number },
  ): Promise<RoomMessageRow[]> =>
    db
      .select()
      .from(roomMessages)
      .where(
        and(
          eq(roomMessages.roomId, roomId),
          // A row comparison, not the equivalent OR of two predicates. Postgres can use a
          // composite index as a range bound for `(a, b) < (x, y)` and seek straight to the
          // cursor; given the disjunction it starts at the newest row and filters forward, so
          // deep pages get steadily more expensive.
          before
            ? sql`(${roomMessages.createdAt}, ${roomMessages.id}) < (${before.createdAt.toISOString()}::timestamptz, ${before.id})`
            : undefined,
        ),
      )
      .orderBy(desc(roomMessages.createdAt), desc(roomMessages.id))
      .limit(limit),
};
