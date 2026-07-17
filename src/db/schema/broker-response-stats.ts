import { date, pgTable, real, text } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";
import { brokers } from "./brokers";

// Anonymer Broker-Empirie-Extrakt (Multi-Tenant Schritt 5, Konto-Loeschung).
// Bei einer Konto-Loeschung wird pro klassifizierter Inbound-Mail des Users EIN
// solcher Datensatz extrahiert, BEVOR der Cascade alles Personenbezogene
// entfernt. Ergebnis ist echte Anonymisierung, nicht Pseudonymisierung: aus
// diesen Zeilen ist kein Personenbezug rekonstruierbar.
//
// INVARIANTE (nicht verhandelbar, strukturell getestet in
// account-deletion.test.ts): Diese Tabelle darf NIEMALS Spalten erhalten, die
// Rueckschluss auf eine Person erlauben -- keine IDs auf users/processes/mails,
// keine Tokens, keine Zeitpunkte feiner als MONAT (auch kein created_at:
// ein Einfuege-Zeitstempel wuerde mit dem Loeschzeitpunkt eines konkreten
// Kontos korrelieren), kein Freitext (Subject/Body/Reasoning koennen Namen
// tragen). brokerId ist kein Personenbezug -- Broker sind Firmen.
export const brokerResponseStats = pgTable("broker_response_stats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  brokerId: text("broker_id")
    .notNull()
    .references(() => brokers.id, { onDelete: "cascade" }),
  // LLM-Klassifikationskategorie (success/no_data_held/... aus classify-inbound).
  category: text("category").notNull(),
  confidence: real("confidence"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  // Antwortzeitpunkt bewusst auf den MONAT gerundet (Monatserster) -- feinere
  // Zeitstempel sind Re-Identifikations-Vektoren.
  respondedMonth: date("responded_month").notNull(),
});
