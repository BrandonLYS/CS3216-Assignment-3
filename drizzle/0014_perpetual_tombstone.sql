ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user_project_unique";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "title" text;--> statement-breakpoint
CREATE INDEX "conversations_scope_idx" ON "conversations" USING btree ("user_id","project_id","updated_at");