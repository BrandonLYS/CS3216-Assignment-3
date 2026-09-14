import { date, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { evidenceKindEnum } from "@/server/db/enums";
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
