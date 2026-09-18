ALTER TYPE "public"."evidence_kind" ADD VALUE 'transcript' BEFORE 'status_update';--> statement-breakpoint
CREATE TABLE "evidence_passages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"speaker" text,
	"timestamp" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_passages_ordinal_uq" UNIQUE("evidence_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "evidence_passages" ADD CONSTRAINT "evidence_passages_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_sources" ADD CONSTRAINT "decision_sources_passage_id_evidence_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."evidence_passages"("id") ON DELETE set null ON UPDATE no action;