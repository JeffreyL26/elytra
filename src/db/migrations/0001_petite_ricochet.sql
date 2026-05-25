CREATE TYPE "public"."mail_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'email_classified';--> statement-breakpoint
CREATE TABLE "process_mails" (
	"id" text PRIMARY KEY NOT NULL,
	"process_id" text NOT NULL,
	"direction" "mail_direction" NOT NULL,
	"provider_message_id" text,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"headers" jsonb,
	"raw_payload" jsonb,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "process_mails" ADD CONSTRAINT "process_mails_process_id_opt_out_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."opt_out_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "process_mails_process_direction_created_idx" ON "process_mails" USING btree ("process_id","direction","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "process_mails_provider_message_id_uq" ON "process_mails" USING btree ("provider_message_id");