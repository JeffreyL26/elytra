import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";
import { optOutProcesses } from "./opt-out-processes";

export const mailDirectionEnum = pgEnum("mail_direction", ["outbound", "inbound"]);

export const processMails = pgTable(
  "process_mails",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    // Nullable: Inbound-Mails treffen ein, bevor das Matching (Aufgabe 7) den
    // Prozess bestimmt. Der process-inbound-mail-Job setzt process_id nach.
    processId: text("process_id").references(() => optOutProcesses.id, {
      onDelete: "cascade",
    }),
    direction: mailDirectionEnum("direction").notNull(),
    providerMessageId: text("provider_message_id"),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    headers: jsonb("headers").$type<Record<string, string | string[]>>(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("process_mails_process_direction_created_idx").on(
      table.processId,
      table.direction,
      table.createdAt,
    ),
    uniqueIndex("process_mails_provider_message_id_uq").on(table.providerMessageId),
  ],
);
