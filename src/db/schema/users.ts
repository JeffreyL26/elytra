import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";

// Better Auth adoptiert diese Tabelle (Multi-Tenant Schritt 2, Option A): die
// bestehenden Spalten und beide FK-Relationen (customer_profiles,
// opt_out_processes haengen an users.id) bleiben unangetastet. Neu hinzu kamen
// rein additiv die von Better Auths user-Modell erwarteten Felder (name,
// emailVerified, image).
//
// WICHTIG -- zwei Verifizierungsfelder mit klarer Rollenverteilung:
//   * emailVerifiedAt (timestamptz)  = SINGLE SOURCE OF TRUTH. Alle App-Gates
//     (Profil-Schreibzugriff, Versand) pruefen ausschliesslich dieses Feld.
//   * emailVerified   (boolean)      = von Better Auth verwaltetes Kernfeld.
//     Wird via databaseHook synchron mit emailVerifiedAt gesetzt (siehe
//     src/lib/auth.ts) -- es darf keinen Pfad geben, der nur eines von beiden
//     setzt. email_verified ist damit effektiv aus email_verified_at abgeleitet.
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Better-Auth-Kernfeld. NOT NULL default false ist safe fuer bestehende Zeilen.
  emailVerified: boolean("email_verified").notNull().default(false),
  // Better-Auth-Kernfeld. Der fachliche Name lebt weiterhin in
  // customer_profiles (firstName/lastName); hier nullable, da Bestandszeilen
  // keinen tragen und Broker-Lookups ihn nicht aus users beziehen.
  name: text("name"),
  // Better-Auth-Kernfeld (Avatar-URL). Ungenutzt, aber Teil des user-Modells.
  image: text("image"),
  // ELYTRA-Zugang (interne Sachbearbeiter-Sicht, tenant-uebergreifend).
  // BEWUSST OHNE Self-Service-Weg: kein API-Endpunkt und kein Zod-Schema
  // schreibt dieses Flag -- gesetzt wird es ausschliesslich per CLI
  // (src/scripts/grant-admin.ts). Betroffene Route-Guards: requireAdminSession()
  // in src/lib/auth-session.ts.
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
