import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";
import { users } from "./users";

// KLARSTELLUNG zur User-Identitaet (zwei Dateien, ein Konzept):
//   * src/db/schema/users.ts = SINGLE SOURCE OF TRUTH fuer die User-Identitaet.
//     An users.id haengen customer_profiles und opt_out_processes; dort lebt
//     auch die SSoT emailVerifiedAt. Better Auth ADOPTIERT diese Tabelle.
//   * DIESE Datei (auth.ts) haelt NUR die Better-Auth-Beitabellen
//     (session/account/verification). Sie definiert KEINE zweite User-Tabelle,
//     sondern referenziert users.id. Wer die User-Identitaet aendert, tut das
//     in users.ts -- nicht hier.
//
// Better-Auth-Kern-Beitabellen (Multi-Tenant Schritt 2). Neu und kollisionsfrei
// -- sie referenzieren die bestehende users-Tabelle, ohne deren Relationen
// anzufassen. JS-Property-Namen = Better-Auth-Feldnamen (camelCase), Spalten
// snake_case. IDs kommen ueber advanced.database.generateId (=createId) aus
// Better Auth; der $defaultFn dient nur direkten Inserts (Tests/Seeds).
//
// FK auf users.id mit onDelete cascade: eine Konto-Loeschung raeumt Sessions
// und Credentials mit ab (spaetere Konto-Loeschung, multi-tenant-profile.md 2.4).

export const session = pgTable("session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  // Passwort-Hash (scrypt) fuer den credential-Provider. Better Auth legt den
  // Hash hier ab, NICHT in users -- deshalb koennen Bestands-users ohne
  // account-Zeile sich nicht einloggen, bis eine Credential-Zeile existiert.
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
