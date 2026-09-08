-- Adoption baseline: creates fresh databases without replacing existing tables or data.
-- Existing foreign keys retain their names and cascading-delete behavior.
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_audit" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "office_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_name" text,
	"target_name" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_files" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"object_key" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "office_files_object_key_key" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"password" boolean DEFAULT true NOT NULL,
	"sso" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "office_settings_id_check" CHECK ("office_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"method" text NOT NULL,
	"policyVersion" integer NOT NULL,
	CONSTRAINT "session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"username" text,
	"displayUsername" text,
	"role" text NOT NULL,
	"approved" boolean NOT NULL,
	"avatar" text NOT NULL,
	"availability" text NOT NULL,
	"statusText" text NOT NULL,
	"mustChangePassword" boolean NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE("email"),
	CONSTRAINT "user_username_key" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_whiteboards" (
	"id" text PRIMARY KEY NOT NULL,
	"elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Team workspace' NOT NULL,
	"map_id" text DEFAULT 'nature-small' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"features" jsonb DEFAULT '{"whiteboard":true}'::jsonb NOT NULL,
	CONSTRAINT "workspace_settings_id_check" CHECK ("workspace_settings"."id" = 1)
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "office_audit_action_id" ON "office_audit" USING btree ("action","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");
--> statement-breakpoint
ALTER TABLE "office_audit" ADD COLUMN IF NOT EXISTS "actor_name" text;
--> statement-breakpoint
ALTER TABLE "office_audit" ADD COLUMN IF NOT EXISTS "target_name" text;
--> statement-breakpoint
ALTER TABLE "office_audit" ADD COLUMN IF NOT EXISTS "details" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "features" jsonb NOT NULL DEFAULT '{"whiteboard":true}'::jsonb;
--> statement-breakpoint
ALTER TABLE "office_files" ADD COLUMN IF NOT EXISTS "created_by" text NOT NULL DEFAULT '';
--> statement-breakpoint
INSERT INTO "office_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "workspace_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
