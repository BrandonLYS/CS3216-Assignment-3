CREATE TYPE "public"."proposal_extractor" AS ENUM('model', 'heuristic');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "decision_proposals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"decided_on" date,
	"context" text,
	"chosen" text NOT NULL,
	"alternatives" text,
	"revisit_when" text,
	"sources" jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extractor" "proposal_extractor" NOT NULL,
	"decision_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_proposals_fingerprint_uq" UNIQUE("project_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "proposal_pass_sources" (
	"project_id" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"entity_id" text NOT NULL,
	"text_hash" text NOT NULL,
	"passed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_pass_sources_project_id_kind_entity_id_pk" PRIMARY KEY("project_id","kind","entity_id")
);
--> statement-breakpoint
ALTER TABLE "decision_proposals" ADD CONSTRAINT "decision_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_proposals" ADD CONSTRAINT "decision_proposals_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_pass_sources" ADD CONSTRAINT "proposal_pass_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_proposals_project_idx" ON "decision_proposals" USING btree ("project_id","status");