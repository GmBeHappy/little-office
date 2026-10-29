CREATE TABLE "workspace_attendance_intervals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"visit_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "attendance_time_order" CHECK ("workspace_attendance_intervals"."ended_at" >= "workspace_attendance_intervals"."started_at")
);
--> statement-breakpoint
ALTER TABLE "workspace_attendance_intervals" ADD CONSTRAINT "workspace_attendance_intervals_workspace_id_user_id_workspace_memberships_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_workspace_time" ON "workspace_attendance_intervals" USING btree ("workspace_id","ended_at");--> statement-breakpoint
CREATE INDEX "attendance_member_time" ON "workspace_attendance_intervals" USING btree ("workspace_id","user_id","ended_at");