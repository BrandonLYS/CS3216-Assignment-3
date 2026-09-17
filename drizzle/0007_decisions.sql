CREATE TYPE "public"."assumption_state" AS ENUM('holding', 'broken', 'retired');--> statement-breakpoint
CREATE TYPE "public"."assumption_subtype" AS ENUM('date', 'person', 'dependency', 'external_rule');--> statement-breakpoint
CREATE TYPE "public"."assumption_target_type" AS ENUM('task', 'milestone', 'person', 'dependency');--> statement-breakpoint
CREATE TYPE "public"."date_target_field" AS ENUM('startDate', 'dueDate');--> statement-breakpoint
CREATE TYPE "public"."decision_edge_kind" AS ENUM('supports', 'leads_to', 'superseded_by');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('active', 'superseded', 'revisited');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('evidence', 'comment', 'activity_event');--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'decision';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'assumption';--> statement-breakpoint
CREATE TABLE "assumptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"statement" text NOT NULL,
	"subtype" "assumption_subtype" NOT NULL,
	"state" "assumption_state" DEFAULT 'holding' NOT NULL,
	"target_type" "assumption_target_type",
	"target_id" text,
	"target_field" date_target_field,
	"assumed_until" date,
	"broken_by_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_edges" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"kind" "decision_edge_kind" NOT NULL,
	"from_type" "entity_type" NOT NULL,
	"from_id" text NOT NULL,
	"to_type" "entity_type" NOT NULL,
	"to_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_edges_uq" UNIQUE("from_id","to_id","kind")
);
--> statement-breakpoint
CREATE TABLE "decision_sources" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"decision_id" text,
	"edge_id" text,
	"kind" "source_kind" NOT NULL,
	"entity_id" text NOT NULL,
	"passage_id" text,
	"excerpt" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_sources_owner_ck" CHECK (num_nonnulls("decision_sources"."decision_id", "decision_sources"."edge_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"decided_on" date NOT NULL,
	"owner_id" text,
	"status" "decision_status" DEFAULT 'active' NOT NULL,
	"context" text,
	"chosen" text NOT NULL,
	"alternatives" text,
	"revisit_when" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_project_number_uq" UNIQUE("project_id","number")
);
--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_edges" ADD CONSTRAINT "decision_edges_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_sources" ADD CONSTRAINT "decision_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_sources" ADD CONSTRAINT "decision_sources_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_sources" ADD CONSTRAINT "decision_sources_edge_id_decision_edges_id_fk" FOREIGN KEY ("edge_id") REFERENCES "public"."decision_edges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assumptions_project_idx" ON "assumptions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assumptions_target_idx" ON "assumptions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "decision_edges_project_idx" ON "decision_edges" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "decision_edges_from_idx" ON "decision_edges" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "decision_edges_to_idx" ON "decision_edges" USING btree ("to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_edges_superseded_by_uq" ON "decision_edges" USING btree ("from_id") WHERE "decision_edges"."kind" = 'superseded_by';--> statement-breakpoint
CREATE INDEX "decision_sources_decision_idx" ON "decision_sources" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_sources_edge_idx" ON "decision_sources" USING btree ("edge_id");--> statement-breakpoint
CREATE INDEX "decision_sources_cited_idx" ON "decision_sources" USING btree ("kind","entity_id");--> statement-breakpoint
CREATE INDEX "decisions_project_idx" ON "decisions" USING btree ("project_id");