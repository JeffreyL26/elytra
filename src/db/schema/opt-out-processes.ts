import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";
import { brokers } from "./brokers";
import { users } from "./users";

export const processStatusEnum = pgEnum("process_status", [
  "pending",
  "contacted",
  "in_progress",
  "success",
  "blacklisted",
  "no_response",
  "manual_review",
  "failed",
]);

export const optOutProcesses = pgTable(
  "opt_out_processes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    brokerId: text("broker_id")
      .notNull()
      .references(() => brokers.id),
    processToken: text("process_token")
      .notNull()
      .unique()
      .$defaultFn(() => createId()),
    status: processStatusEnum("status").notNull().default("pending"),
    lastContactedAt: timestamp("last_contacted_at"),
    nextActionAt: timestamp("next_action_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("opt_out_processes_user_broker_uq").on(
      table.userId,
      table.brokerId,
    ),
  ],
);
