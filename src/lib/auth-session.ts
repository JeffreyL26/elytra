import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";

// Bruecke zwischen Better Auth und dem bestehenden *ForUser-Zugriffslayer
// (src/lib/user-data-access.ts). INVARIANTE aus der Multi-Tenant-Spec: die
// userId stammt AUSSCHLIESSLICH aus der Session -- nie aus Body/Query/Header.
// Jeder user-gebundene Endpunkt zieht sie hierueber und reicht sie an
// getProfileForUser/getProcessesForUser/getProcessMailsForUser weiter.

// userId der aktuellen Session oder null (keine/ungueltige Session).
export async function getSessionUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user?.id ?? null;
}

// Verifizierungs-GATE fuer Profil-SCHREIBzugriff (Profil anlegen/aendern) und
// spaeteren Versand. Prueft die SINGLE SOURCE OF TRUTH emailVerifiedAt direkt
// in der DB -- NICHT das (abgeleitete) email_verified-Boolean und NICHT ein
// Session-Feld. So kann das Gate niemals das falsche Feld lesen, selbst wenn
// die beiden je auseinanderliefen.
//
// Liefert die userId nur, wenn eine Session existiert UND die E-Mail verifiziert
// ist; sonst null. Lesezugriffe brauchen dieses Gate nicht (dort reicht
// getSessionUserId).
export async function getVerifiedSessionUserId(headers: Headers): Promise<string | null> {
  const userId = await getSessionUserId(headers);
  if (!userId) {
    return null;
  }
  const [row] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.emailVerifiedAt ? userId : null;
}
