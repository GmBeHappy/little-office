CREATE TABLE "workspace_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"token" text NOT NULL,
	"session_id" text NOT NULL,
	"platform" text NOT NULL,
	"locale" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_push_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_push_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"notification_id" integer NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_push_devices" ADD CONSTRAINT "workspace_push_devices_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_push_devices" ADD CONSTRAINT "workspace_push_devices_workspace_id_user_id_workspace_memberships_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_push_jobs" ADD CONSTRAINT "workspace_push_jobs_notification_id_workspace_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."workspace_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_push_jobs" ADD CONSTRAINT "workspace_push_jobs_device_id_workspace_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."workspace_push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_push_jobs" ADD CONSTRAINT "workspace_push_jobs_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_workspace_install" ON "workspace_push_devices" USING btree ("workspace_id","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_workspace_token" ON "workspace_push_devices" USING btree ("workspace_id","token");--> statement-breakpoint
CREATE INDEX "push_recipient" ON "workspace_push_devices" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "push_jobs_available" ON "workspace_push_jobs" USING btree ("available_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_jobs_once" ON "workspace_push_jobs" USING btree ("notification_id","device_id");