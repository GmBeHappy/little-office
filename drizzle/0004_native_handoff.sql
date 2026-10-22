CREATE TABLE "native_handoffs" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "native_handoffs" ADD CONSTRAINT "native_handoffs_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;