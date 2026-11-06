CREATE TABLE "workspace_notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspace_notifications" ADD CONSTRAINT "workspace_notifications_workspace_id_recipient_workspace_memberships_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","recipient") REFERENCES "public"."workspace_memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_member_id" ON "workspace_notifications" USING btree ("workspace_id","recipient","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unread" ON "workspace_notifications" USING btree ("workspace_id","recipient") WHERE "workspace_notifications"."read_at" IS NULL;