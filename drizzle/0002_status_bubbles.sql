-- Early versions of the status-bubble branch already added this column in 0001.
-- Preserve those values when upgrading to the reconciled migration sequence.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "statusIcon" text DEFAULT '' NOT NULL;
