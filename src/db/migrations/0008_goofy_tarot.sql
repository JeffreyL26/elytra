CREATE TABLE "broker_response_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"broker_id" text NOT NULL,
	"category" text NOT NULL,
	"confidence" real,
	"model" text,
	"prompt_version" text,
	"responded_month" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_response_stats" ADD CONSTRAINT "broker_response_stats_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;