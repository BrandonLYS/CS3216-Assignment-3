import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id } from "@/server/db/columns";
import { roomTypeEnum } from "@/server/db/enums";
import { people } from "@/server/modules/people/schema";
import { projects } from "@/server/modules/projects/schema";

/**
 * A place inside one Project where the PM and the People they admit exchange Chat Messages.
 * `name` is null for a one-to-one Room, which is labelled by the other Person (ADR 0009).
 */
export const rooms = pgTable(
  "rooms",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: roomTypeEnum("type").notNull(),
    name: text("name"),
    /** The PM who created the Room; only a PM can (issue #54). */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rooms_project_idx").on(t.projectId),
    // Carries no meaning on its own: Postgres only lets a composite foreign key reference
    // columns covered by a matching unique constraint, and room_messages needs (id, project_id).
    unique("rooms_id_project_uq").on(t.id, t.projectId),
  ],
);

/** A Person admitted to a Room by the PM. Admission is the only way in. */
export const roomParticipants = pgTable(
  "room_participants",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.personId] }), index("room_participants_person_idx").on(t.personId)],
);

/**
 * One plain-text entry in a Room, optionally carrying a single media attachment.
 * Never edited and never deleted (issue #55).
 *
 * `projectId` is denormalised so a read can filter by Project before touching `rooms`, as
 * `comments` and `activity_events` already do. Unlike those, it duplicates a fact owned by the
 * Room, so the composite foreign key below pins the two together and the row cannot disagree.
 *
 * Author follows the Comment attribution pattern (ADR 0006): both foreign keys are nullable and
 * `authorName` is the durable display, so deleting a Person never erases what they said.
 */
export const roomMessages = pgTable(
  "room_messages",
  {
    id: id(),
    roomId: text("room_id").notNull(),
    projectId: text("project_id").notNull(),
    text: text("text"),
    attachmentUrl: text("attachment_url"),
    mimeType: text("mime_type"),
    authorPersonId: text("author_person_id").references(() => people.id, { onDelete: "set null" }),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Snapshot of the author's name at write time; survives the Person or User being deleted. */
    authorName: text("author_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The only reference to the Room, so there is one cascade path and not two. Without the
    // cascade, deleting a Room (and so a Project) would fail: Postgres defaults to NO ACTION.
    foreignKey({
      name: "room_messages_room_fk",
      columns: [t.roomId, t.projectId],
      foreignColumns: [rooms.id, rooms.projectId],
    }).onDelete("cascade"),
    index("room_messages_room_time_idx").on(t.roomId, t.createdAt.desc(), t.id.desc()),
    check("room_messages_content_ck", sql`num_nonnulls(${t.text}, ${t.attachmentUrl}) >= 1`),
    // At most one, never exactly one: `on delete set null` must be able to leave both null.
    check("room_messages_author_ck", sql`num_nonnulls(${t.authorPersonId}, ${t.authorUserId}) <= 1`),
    check("room_messages_attachment_ck", sql`num_nonnulls(${t.attachmentUrl}, ${t.mimeType}) <> 1`),
  ],
);

export type RoomRow = typeof rooms.$inferSelect;
export type NewRoomRow = typeof rooms.$inferInsert;
export type RoomParticipantRow = typeof roomParticipants.$inferSelect;
export type RoomMessageRow = typeof roomMessages.$inferSelect;
export type NewRoomMessageRow = typeof roomMessages.$inferInsert;
