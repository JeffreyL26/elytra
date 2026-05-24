CREATE TYPE "public"."opt_out_method" AS ENUM('email', 'form', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."process_status" AS ENUM('pending', 'contacted', 'in_progress', 'success', 'blacklisted', 'no_response', 'manual_review', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('process_created', 'mail_sent', 'mail_received', 'status_changed', 'manual_intervention', 'error');--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"website_url" text,
	"opt_out_method" "opt_out_method" NOT NULL,
	"opt_out_email" text,
	"opt_out_form_url" text,
	"is_dummy" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brokers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email_addresses" jsonb,
	"phone_numbers" jsonb,
	"postal_addresses" jsonb,
	"date_of_birth" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "opt_out_processes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"broker_id" text NOT NULL,
	"process_token" text NOT NULL,
	"status" "process_status" DEFAULT 'pending' NOT NULL,
	"last_contacted_at" timestamp,
	"next_action_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opt_out_processes_process_token_unique" UNIQUE("process_token")
);
--> statement-breakpoint
CREATE TABLE "process_events" (
	"id" text PRIMARY KEY NOT NULL,
	"process_id" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opt_out_processes" ADD CONSTRAINT "opt_out_processes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opt_out_processes" ADD CONSTRAINT "opt_out_processes_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_events" ADD CONSTRAINT "process_events_process_id_opt_out_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."opt_out_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opt_out_processes_user_broker_uq" ON "opt_out_processes" USING btree ("user_id","broker_id");--> statement-breakpoint
CREATE INDEX "process_events_process_created_idx" ON "process_events" USING btree ("process_id","created_at");