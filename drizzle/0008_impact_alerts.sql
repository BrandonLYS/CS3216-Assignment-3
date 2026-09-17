ALTER TYPE "public"."via_actor" ADD VALUE 'system';--> statement-breakpoint
ALTER TABLE "assumptions" ADD COLUMN "broken_reason" text;--> statement-breakpoint
ALTER TABLE "assumptions" ADD COLUMN "alert_dismissed_at" timestamp with time zone;