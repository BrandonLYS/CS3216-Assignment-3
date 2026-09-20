DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'assumption_state' AND e.enumlabel = 'broken'
  ) THEN
    ALTER TYPE "public"."assumption_state" ADD VALUE 'broken';
  END IF;
END $$;--> statement-breakpoint
