DROP INDEX "people_project_email_uq";--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
CREATE UNIQUE INDEX "people_project_email_uq" ON "people" USING btree ("project_id",lower("email")) WHERE "people"."email" is not null and ("people"."password_hash" is not null or "people"."invite_token_hash" is not null);