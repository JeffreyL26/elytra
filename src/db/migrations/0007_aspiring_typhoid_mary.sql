ALTER TABLE "opt_out_processes" DROP CONSTRAINT "opt_out_processes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "opt_out_processes" ADD CONSTRAINT "opt_out_processes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;