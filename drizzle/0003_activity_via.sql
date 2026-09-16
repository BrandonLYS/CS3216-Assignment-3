CREATE TYPE "public"."via_actor" AS ENUM('assistant', 'reflection');--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "via" "via_actor";