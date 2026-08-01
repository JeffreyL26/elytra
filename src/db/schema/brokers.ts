import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";

export const optOutMethodEnum = pgEnum("opt_out_method", ["email", "form", "mixed"]);

export const responsivenessTierEnum = pgEnum("responsiveness_tier", [
  "fast",
  "normal",
  "slow",
  "unknown",
]);

// INVARIANTE ZUR PORTFOLIO-PFLEGE: Broker mit Vorgangshistorie zahlender Kunden
// werden NIE hart geloescht -- Kuration laeuft dann ueber Entfernung aus den
// Stammdaten (real-brokers-data.ts) + is_active=false, damit Portfolio-Pflege
// niemals rueckwirkend Kundenhistorie zerstoert. Der Seed loescht ohnehin nie
// (slug-basiertes Upsert), entfernte Stammdaten lassen DB-Zeilen unangetastet.
// Die harte Loeschung vom 01.08.2026 (abis, deutsche-post-adress,
// deutsche-post-direkt) betraf ausschliesslich Self-Test-Vorgaenge.
export const brokers = pgTable("brokers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country"),
  websiteUrl: text("website_url"),
  optOutMethod: optOutMethodEnum("opt_out_method").notNull(),
  optOutEmail: text("opt_out_email"),
  optOutFormUrl: text("opt_out_form_url"),
  // ISO-639-1-Sprachcode fuer die Broker-Korrespondenz. Type-Constraint nur im
  // TS (kein pgEnum), damit weitere Sprachen ohne DB-Migration moeglich sind.
  language: text("language").$type<"de" | "en" | "fr" | "es">().notNull().default("de"),
  // Vom Worker beim Inbound-Match gesetzt; nullable bis zur ersten Antwort.
  lastResponseAt: timestamp("last_response_at", { withTimezone: true }),
  responsivenessTier: responsivenessTierEnum("responsiveness_tier").notNull().default("unknown"),
  // Verlangt der Broker bei der Erstanfrage die Vollmacht als Anhang?
  // Schema-vorbereitet fuer Phase 3c; aktuell von keinem Template genutzt.
  requiresAuthorizationAttachment: boolean("requires_authorization_attachment")
    .notNull()
    .default(false),
  isDummy: boolean("is_dummy").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
