CREATE TYPE "public"."room_type" AS ENUM('group', 'one_to_one');--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'room';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'participant';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'chat_message';--> statement-breakpoint
CREATE TABLE "room_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"project_id" text NOT NULL,
	"text" text,
	"attachment_url" text,
	"mime_type" text,
	"author_person_id" text,
	"author_user_id" text,
	"author_name" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_messages_content_ck" CHECK (num_nonnulls("room_messages"."text", "room_messages"."attachment_url") >= 1),
	CONSTRAINT "room_messages_author_ck" CHECK (num_nonnulls("room_messages"."author_person_id", "room_messages"."author_user_id") <= 1),
	CONSTRAINT "room_messages_attachment_ck" CHECK (num_nonnulls("room_messages"."attachment_url", "room_messages"."mime_type") <> 1)
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"room_id" text NOT NULL,
	"person_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_participants_room_id_person_id_pk" PRIMARY KEY("room_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"type" "room_type" NOT NULL,
	"name" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_id_project_uq" UNIQUE("id","project_id")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_room_fk" FOREIGN KEY ("room_id","project_id") REFERENCES "public"."rooms"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_messages_room_time_idx" ON "room_messages" USING btree ("room_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "room_participants_person_idx" ON "room_participants" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "rooms_project_idx" ON "rooms" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_project_email_uq" ON "people" USING btree ("project_id",lower("email")) WHERE "people"."email" is not null and ("people"."password_hash" is not null or "people"."invite_token_hash" is not null);