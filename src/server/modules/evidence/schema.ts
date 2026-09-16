import { date, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { entityTypeEnum, evidenceKindEnum } from "@/server/db/enums";
import { projects } from "@/server/modules/projects/schema";

/**
 * A source artifact for a project. Either a stored file (`storageKey`) or pasted
 * text (`body`). `extractedText` is reserved for the AI layer and stays null for now.
 */
export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: evidenceKindEnum("kind").notNull().default("other"),
    /** Date the artifact refers to (meeting date, report date), not the upload date. */
    sourceDate: date("source_date"),
    notes: text("notes"),
    body: text("body"),
    storageKey: text("storage_key"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    extractedText: text("extracted_text"),
    ...timestamps,
  },
  (t) => [index("evidence_project_idx").on(t.projectId)],
);

export type EvidenceRow = typeof evidence.$inferSelect;
export type NewEvidenceRow = typeof evidence.$inferInsert;

/**
 * Many-to-many between Evidence and Tasks/Risks/Milestones. The item side is
 * polymorphic, so its cascade is done in the item services (`deleteForEntity`).
 */
export const evidenceLinks = pgTable(
  "evidence_links",
  {
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Denormalised for cheap ownership checks and per-project listing. */
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.evidenceId, t.entityType, t.entityId] }),
    index("evidence_links_entity_idx").on(t.entityType, t.entityId),
    index("evidence_links_project_idx").on(t.projectId),
  ],
);

export type EvidenceLinkRow = typeof evidenceLinks.$inferSelect;
export type NewEvidenceLinkRow = typeof evidenceLinks.$inferInsert;
