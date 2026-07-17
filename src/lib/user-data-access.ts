import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customerProfiles, optOutProcesses, processMails } from "@/db/schema";
import type { CustomerProfileInput } from "@/lib/customer-profile-schema";

// Mandanten-Zugriffslayer (Spec docs/specs/multi-tenant-profile.md § 2.3).
//
// INVARIANTE: Dies ist der EINZIGE Lesepfad fuer user-gebundene Daten
// (Profil, Prozesse, Mails). Verstreute db.select()-Aufrufe in Routen sind zu
// vermeiden -- die Mandantentrennung sitzt an dieser einen pruefbaren Stelle.
//
// Regeln, die hier nicht verhandelbar sind:
//   1. userId ist IMMER der erste Parameter und stammt IMMER aus der Session.
//      NIEMALS aus einem Request-Body, Query-Parameter oder Header. Kein
//      Endpunkt darf eine userId entgegennehmen.
//   2. Jede Query filtert zwingend auf diese userId. Es gibt bewusst keine
//      Variante ohne den Filter -- auch nicht "nur fuers Admin-UI".
//   3. Fremde Ressourcen liefern leer/null, nicht etwa fremde Daten. Aufrufer
//      uebersetzen das nach aussen in 404 (nicht 403): die Existenz einer
//      fremden Ressource wird nicht verraten.
//   4. Zusatz-Filter (z. B. processId) sind optional -- der userId-Check ist
//      es nie. Es darf kein Query-Pfad entstehen, der ueber eine processId
//      Daten ohne userId-Pruefung herausgibt.
//
// ELYTRA/Admin-Sichten brauchen spaeter einen eigenen, bewusst getrennten
// Layer -- dieser hier ist ausschliesslich der Kundenpfad.

export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type OptOutProcess = typeof optOutProcesses.$inferSelect;
export type ProcessMail = typeof processMails.$inferSelect;

// Profil des Users. null = kein Profil (oder fremdes/unbekanntes userId).
export async function getProfileForUser(userId: string): Promise<CustomerProfile | null> {
  const [profile] = await db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

// Alle Opt-Out-Prozesse des Users.
export async function getProcessesForUser(userId: string): Promise<OptOutProcess[]> {
  return db
    .select()
    .from(optOutProcesses)
    .where(eq(optOutProcesses.userId, userId))
    .orderBy(optOutProcesses.createdAt);
}

// SCHREIB-Pfade (Profil-CRUD, api-contract.md § 2). Wie die Reads zwingend an
// die userId aus der Session geankert -- der Aufrufer reicht NIE eine userId aus
// dem Request-Body herein (Regel 1). Validierung passiert VOR diesen Funktionen
// ausschliesslich ueber customerProfileSchema; hier landen nur gepruefte Daten.

// Legt das Profil des Users an. Der eindeutige userId-Index verhindert ein
// zweites Profil; der Aufrufer prueft Existenz vorab (409 profile_exists).
export async function createProfileForUser(
  userId: string,
  input: CustomerProfileInput,
): Promise<CustomerProfile> {
  const [row] = await db
    .insert(customerProfiles)
    .values({
      userId,
      firstName: input.firstName,
      lastName: input.lastName,
      emailAddresses: input.emailAddresses,
      phoneNumbers: input.phoneNumbers ?? null,
      postalAddresses: input.postalAddresses,
      dateOfBirth: input.dateOfBirth ?? null,
    })
    .returning();
  return row;
}

// Vollstaendiges Replace des Profils (kein Merge -- api-contract.md § 2.3).
// null = es existierte keines (Aufrufer -> 404).
export async function replaceProfileForUser(
  userId: string,
  input: CustomerProfileInput,
): Promise<CustomerProfile | null> {
  const [row] = await db
    .update(customerProfiles)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      emailAddresses: input.emailAddresses,
      phoneNumbers: input.phoneNumbers ?? null,
      postalAddresses: input.postalAddresses,
      dateOfBirth: input.dateOfBirth ?? null,
      updatedAt: new Date(),
    })
    .where(eq(customerProfiles.userId, userId))
    .returning();
  return row ?? null;
}

// Loescht das Profil des Users. true = eine Zeile entfernt, false = es gab keine.
export async function deleteProfileForUser(userId: string): Promise<boolean> {
  const rows = await db
    .delete(customerProfiles)
    .where(eq(customerProfiles.userId, userId))
    .returning({ id: customerProfiles.id });
  return rows.length > 0;
}

// Alle Mails aller Prozesse des Users; optional auf einen Prozess eingegrenzt.
//
// process_mails haengt am Prozess, nicht am User -- der Ownership-Check laeuft
// deshalb ueber den INNER JOIN auf opt_out_processes.user_id. Das deckt beides
// ab: eine fremde processId liefert leer (der Join-Filter greift), und nicht
// zugeordnete Inbound-Mails (process_id NULL) tauchen nie in einer Kundensicht
// auf, weil der Inner Join sie ausschliesst.
export async function getProcessMailsForUser(
  userId: string,
  processId?: string,
): Promise<ProcessMail[]> {
  const conditions = [eq(optOutProcesses.userId, userId)];
  if (processId) {
    conditions.push(eq(processMails.processId, processId));
  }

  const rows = await db
    .select({ mail: processMails })
    .from(processMails)
    .innerJoin(optOutProcesses, eq(processMails.processId, optOutProcesses.id))
    .where(and(...conditions))
    .orderBy(processMails.createdAt);

  return rows.map((row) => row.mail);
}
