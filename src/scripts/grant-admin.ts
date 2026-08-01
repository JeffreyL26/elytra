import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { users } from "@/db/schema";

// Setzt das ELYTRA-Admin-Flag fuer ein bestehendes Konto. BEWUSST der EINZIGE
// Schreibweg auf users.is_admin -- es gibt keinen API-Endpunkt und kein
// Zod-Schema, das dieses Flag setzen kann (siehe Kommentar am Schema).
//
//   pnpm grant-admin <email>          Flag setzen
//   pnpm grant-admin <email> --revoke Flag entziehen
//
// Idempotent: mehrfaches Aufrufen aendert nichts und meldet den Ist-Zustand.

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"));

  if (!email) {
    console.error("Aufruf: pnpm grant-admin <email> [--revoke]");
    process.exitCode = 1;
    return;
  }

  const [user] = await db
    .select({ id: users.id, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Bewusst kein Anlegen: Admin-Rechte gibt es nur fuer ein Konto, das sich
    // regulaer registriert hat (inkl. Passwort-Policy und Verifizierung).
    console.error(`Kein Konto mit E-Mail '${email}' gefunden. Zuerst regulaer registrieren.`);
    process.exitCode = 1;
    return;
  }

  const target = !revoke;
  if (user.isAdmin === target) {
    console.log(`Unveraendert: '${email}' ist bereits ${target ? "Admin" : "kein Admin"}.`);
    return;
  }

  await db
    .update(users)
    .set({ isAdmin: target, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  console.log(`OK: '${email}' ist jetzt ${target ? "Admin (ELYTRA-Zugang)" : "kein Admin mehr"}.`);
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("grant-admin fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
