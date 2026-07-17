import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { account } from "@/db/schema";
import { deleteAccount } from "@/lib/account-deletion";
import { getSessionUserId } from "@/lib/auth-session";

// DELETE /api/account -- Konto-Loeschung (api-contract.md § 2.5).
//
// BEWUSSTE AUSNAHME vom Verify-Gate: hier reicht getSessionUserId (eingeloggt),
// NICHT getVerifiedSessionUserId. Wer sich mit einer Tippfehler-Adresse
// registriert hat, kann die Mail nie verifizieren -- und muss sich trotzdem
// loeschen koennen (Betroffenenrecht). Die Re-Authentifizierung uebernimmt
// stattdessen das aktuelle Passwort im Body.

function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

const bodySchema = z.object({ password: z.string().min(1) });

export async function DELETE(req: Request): Promise<Response> {
  // userId AUSSCHLIESSLICH aus der Session -- der Endpunkt nimmt keine Ziel-ID
  // entgegen; ein User kann nur sich selbst loeschen (Mandantentrennung).
  const userId = await getSessionUserId(req.headers);
  if (!userId) {
    return apiError(401, "unauthorized", "Keine gueltige Session");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_json", "Request-Body ist kein gueltiges JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "password_required", "Aktuelles Passwort ist erforderlich");
  }

  // Re-Authentifizierung gegen versehentliche/fremdgesteuerte Loeschung: die
  // Session allein reicht nicht, das aktuelle Passwort muss stimmen. Der
  // scrypt-Hash liegt in der Better-Auth-account-Zeile (providerId credential).
  const [credential] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (!credential?.password) {
    return apiError(403, "invalid_password", "Passwort-Pruefung nicht moeglich");
  }
  const valid = await verifyPassword({ hash: credential.password, password: parsed.data.password });
  if (!valid) {
    return apiError(403, "invalid_password", "Passwort ist falsch");
  }

  await deleteAccount(userId);

  // 204, kein Body. Die Session ist durch den Cascade bereits serverseitig
  // invalidiert (session-Zeilen des Users sind geloescht).
  return new Response(null, { status: 204 });
}
