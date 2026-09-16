CREATE TABLE "evidence_links" (
	"evidence_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_links_evidence_id_entity_type_entity_id_pk" PRIMARY KEY("evidence_id","entity_type","entity_id")
);
--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_links_entity_idx" ON "evidence_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "evidence_links_project_idx" ON "evidence_links" USING btree ("project_id");