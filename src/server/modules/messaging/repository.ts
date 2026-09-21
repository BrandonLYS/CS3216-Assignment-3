import { and, asc, desc, eq, sql } from "drizzle-orm";
import { user } from "@/server/auth/schema";
import type { DbOrTx } from "@/server/db/client";
import { people } from "@/server/modules/people/schema";
import {
  roomMessages,
  roomParticipants,
  rooms,
  type NewRoomMessageRow,
  type NewRoomRow,
  type RoomMessageRow,
  type RoomParticipantRow,
  type RoomRow,
} from "./schema";

/** Where a page of history stopped. Keyset, not offset: a Room is appended to while it is read. */
export type MessageCursor = { createdAt: Date; id: string };

/** One Person in a Room, as the messages view renders them. */
export type RoomParticipantItem = Awaited<ReturnType<typeof messagingRepo.listParticipants>>[number];

export const messagingRepo = {
  insertRoom: async (db: DbOrTx, values: NewRoomRow): Promise<RoomRow> => {
    const [row] = await db.insert(rooms).values(values).returning();
    return row!;
  },

  /**
   * The only way to read one Room, and it takes the Project it is expected to be in, so
   * a caller cannot reach across Projects by knowing an id (issue #53).
   *
   * `lock` takes a row lock for the rest of the transaction. Admission uses it to serialise
   * concurrent writers against one Room, which is what makes "a one-to-one Room holds one
   * Person" hold under a race rather than only in the common case.
   */
  findRoom: async (db: DbOrTx, projectId: string, id: string, lock = false): Promise<RoomRow | undefined> => {
    const query = db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.projectId, projectId)));
    const [row] = await (lock ? query.for("update") : query);
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

  /**
   * Admitting the same Person twice is a no-op, so callers need not check first. The row is
   * returned only when it was really inserted (Postgres returns nothing for a conflict), which
   * is how the service knows whether to record an Activity Event.
   */
  addParticipant: (db: DbOrTx, roomId: string, personId: string): Promise<RoomParticipantRow[]> =>
    db.insert(roomParticipants).values({ roomId, personId }).onConflictDoNothing().returning(),

  /**
   * Takes no `projectId`: `room_participants` has no such column to filter on. The Room is
   * resolved against its Project by `messagingService` before this is reached.
   */
  listParticipants: (db: DbOrTx, roomId: string) =>
    db
      .select({ personId: people.id, name: people.name, email: people.email, addedAt: roomParticipants.addedAt })
      .from(roomParticipants)
      .innerJoin(people, eq(people.id, roomParticipants.personId))
      .where(eq(roomParticipants.roomId, roomId))
      .orderBy(asc(people.name)),

  /**
   * Every Room's Participants in one query, for a Room list that names the People in each
   * Room. Per-Room reads would be an N+1 the moment a Project has more than a few Rooms.
   */
  listParticipantsForProject: (db: DbOrTx, projectId: string) =>
    db
      .select({
        roomId: roomParticipants.roomId,
        personId: people.id,
        name: people.name,
        email: people.email,
        addedAt: roomParticipants.addedAt,
      })
      .from(roomParticipants)
      .innerJoin(rooms, eq(rooms.id, roomParticipants.roomId))
      .innerJoin(people, eq(people.id, roomParticipants.personId))
      .where(eq(rooms.projectId, projectId))
      .orderBy(asc(people.name)),

  /** Project-scoped for the same reason as `listParticipants`: through the Room, not a column. */
  isParticipant: (db: DbOrTx, roomId: string, personId: string): Promise<boolean> =>
    db
      .select({ one: sql<number>`1` })
      .from(roomParticipants)
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.personId, personId)))
      .limit(1)
      .then((xs) => xs.length > 0),

  /**
   * The PM's display name, snapshotted onto a Chat Message at write time (ADR 0006). Read
   * here rather than joined at read time because `room_messages.author_name` is NOT NULL and
   * must survive the `user` row; `comments/repository.ts` reads the same table the same way.
   */
  findAuthorName: async (db: DbOrTx, userId: string): Promise<string | undefined> => {
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
    return row?.name;
  },

  /**
   * Takes the Room row, not its id: `projectId` is then copied from the Room and never
   * supplied by the caller, and the Room has already been resolved inside its Project by
   * `findRoom`. A fabricated pair is still refused by `room_messages_room_fk`, which is
   * also what rejects a Room deleted between the read and this insert.
   */
  insertMessage: async (
    db: DbOrTx,
    room: Pick<RoomRow, "id" | "projectId">,
    values: Omit<NewRoomMessageRow, "roomId" | "projectId">,
  ): Promise<RoomMessageRow> => {
    const [row] = await db
      .insert(roomMessages)
      .values({ ...values, roomId: room.id, projectId: room.projectId })
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
    projectId: string,
    roomId: string,
    { before, limit }: { before?: MessageCursor; limit: number },
  ): Promise<RoomMessageRow[]> =>
    db
      .select()
      .from(roomMessages)
      .where(
        and(
          eq(roomMessages.roomId, roomId),
          // Redundant given the composite foreign key, which already stops the two disagreeing,
          // and kept anyway so no read of a Room's history omits the Project it belongs to.
          eq(roomMessages.projectId, projectId),
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
