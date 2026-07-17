import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId, createProcessToken } from "@/lib/ids";
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
  // Terminal wie success: Broker haelt keine (relevanten) Daten zur Person.
  // Momentaufnahme -- Recurring-Re-Checks (Phase 3b.8) koennen den Prozess
  // ueber next_action_at wieder aufgreifen.
  "no_data_held",
]);

export const optOutProcesses = pgTable(
  "opt_out_processes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    // onDelete cascade (Multi-Tenant Schritt 5, Konto-Loeschung): User weg ->
    // Prozesse weg -> deren Mails/Events weg (process_mails/process_events
    // cascaden auf process_id). Das Mandat erlischt mit dem Konto.
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brokerId: text("broker_id")
      .notNull()
      .references(() => brokers.id),
    processToken: text("process_token")
      .notNull()
      .unique()
      .$defaultFn(() => createProcessToken()),
    status: processStatusEnum("status").notNull().default("pending"),
    // Selbst-Anfrage (Betroffener = Absender, Ich-Form, keine Vollmacht):
    // steuert die Template-Variante. Erster Real-Versand (3b.5) laeuft so.
    isSelfRequest: boolean("is_self_request").notNull().default(false),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("opt_out_processes_user_broker_uq").on(table.userId, table.brokerId)],
);
