import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";
import { optOutProcesses } from "./opt-out-processes";

export const eventTypeEnum = pgEnum("event_type", [
  "process_created",
  "mail_sent",
  "mail_received",
  "status_changed",
  "manual_intervention",
  "error",
  "email_classified",
]);

export const processEvents = pgTable(
  "process_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    processId: text("process_id")
      .notNull()
      .references(() => optOutProcesses.id, { onDelete: "cascade" }),
    eventType: eventTypeEnum("event_type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("process_events_process_created_idx").on(table.processId, table.createdAt)],
);
