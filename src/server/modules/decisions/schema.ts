import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import {
  assumptionStateEnum,
  assumptionSubtypeEnum,
  assumptionTargetTypeEnum,
  dateTargetFieldEnum,
  decisionEdgeKindEnum,
  decisionStatusEnum,
  entityTypeEnum,
  sourceKindEnum,
} from "@/server/db/enums";
import { people } from "@/server/modules/people/schema";
import { projects } from "@/server/modules/projects/schema";

/** A recorded choice on a Project (ADR 0008). Rendered as `D-${number}`. */
export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    decidedOn: date("decided_on").notNull(),
    ownerId: text("owner_id").references(() => people.id, { onDelete: "set null" }),
    status: decisionStatusEnum("status").notNull().default("active"),
    context: text("context"),
    chosen: text("chosen").notNull(),
    alternatives: text("alternatives"),
    revisitWhen: text("revisit_when"),
    ...timestamps,
  },
  (t) => [
    index("decisions_project_idx").on(t.projectId),
    unique("decisions_project_number_uq").on(t.projectId, t.number),
  ],
);

export type DecisionRow = typeof decisions.$inferSelect;
export type NewDecisionRow = typeof decisions.$inferInsert;

/**
 * A condition a Decision rests on. The watched target is a column set, not an edge, because
 * it is one-to-one and drives deterministic detection. `brokenByEventId` is reserved for the
 * detector; `targetId` is polymorphic and checked in the service.
 */
export const assumptions = pgTable(
  "assumptions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    subtype: assumptionSubtypeEnum("subtype").notNull(),
    state: assumptionStateEnum("state").notNull().default("holding"),
    targetType: assumptionTargetTypeEnum("target_type"),
    targetId: text("target_id"),
    targetField: dateTargetFieldEnum("target_field"),
    assumedUntil: date("assumed_until"),
    brokenByEventId: text("broken_by_event_id"),
    /** Human sentence composed by the detector (or the PM) when the Assumption broke. */
    brokenReason: text("broken_reason"),
    /** Set when the PM dismisses the impact alert; never clears `state`. */
    alertDismissedAt: timestamp("alert_dismissed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("assumptions_project_idx").on(t.projectId),
    index("assumptions_target_idx").on(t.targetType, t.targetId),
  ],
);

export type AssumptionRow = typeof assumptions.$inferSelect;
export type NewAssumptionRow = typeof assumptions.$inferInsert;

/** Typed edge, always cause to consequence. Endpoints are polymorphic; integrity is enforced in the service. */
export const decisionEdges = pgTable(
  "decision_edges",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: decisionEdgeKindEnum("kind").notNull(),
    fromType: entityTypeEnum("from_type").notNull(),
    fromId: text("from_id").notNull(),
    toType: entityTypeEnum("to_type").notNull(),
    toId: text("to_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decision_edges_project_idx").on(t.projectId),
    index("decision_edges_from_idx").on(t.fromId),
    index("decision_edges_to_idx").on(t.toId),
    unique("decision_edges_uq").on(t.fromId, t.toId, t.kind),
    uniqueIndex("decision_edges_superseded_by_uq")
      .on(t.fromId)
      .where(sql`${t.kind} = 'superseded_by'`),
  ],
);

export type DecisionEdgeRow = typeof decisionEdges.$inferSelect;
export type NewDecisionEdgeRow = typeof decisionEdges.$inferInsert;

/**
 * A citation from a Decision or an edge into the Project history. `entityId` is an unenforced
 * polymorphic key (Evidence and Comments are deletable); `label` and `excerpt` are snapshots and
 * the durable display. `passageId` is reserved for passage-level citation.
 */
export const decisionSources = pgTable(
  "decision_sources",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    decisionId: text("decision_id").references(() => decisions.id, { onDelete: "cascade" }),
    edgeId: text("edge_id").references(() => decisionEdges.id, { onDelete: "cascade" }),
    kind: sourceKindEnum("kind").notNull(),
    entityId: text("entity_id").notNull(),
    passageId: text("passage_id"),
    excerpt: text("excerpt").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decision_sources_decision_idx").on(t.decisionId),
    index("decision_sources_edge_idx").on(t.edgeId),
    index("decision_sources_cited_idx").on(t.kind, t.entityId),
    check("decision_sources_owner_ck", sql`num_nonnulls(${t.decisionId}, ${t.edgeId}) = 1`),
  ],
);

export type DecisionSourceRow = typeof decisionSources.$inferSelect;
export type NewDecisionSourceRow = typeof decisionSources.$inferInsert;
