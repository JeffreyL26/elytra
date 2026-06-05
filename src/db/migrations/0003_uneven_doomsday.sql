CREATE TYPE "public"."responsiveness_tier" AS ENUM('fast', 'normal', 'slow', 'unknown');--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "language" text DEFAULT 'de' NOT NULL;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "last_response_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "responsiveness_tier" "responsiveness_tier" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "requires_authorization_attachment" boolean DEFAULT false NOT NULL;