import { env } from "@/lib/env";

// Self-Request-Testprofil aus Env (Phase 3b.4.5). Eigene Datei statt Teil
// des Seed-Scripts, damit die Validierung testbar ist, ohne dass der Import
// einen DB-Seed anstoesst.
export interface SelfProfileEnv {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  // Absenderadresse (From) UND Account-/Lookup-Key des Self-Users. Bewusst
  // getrennt von den Identifikationsadressen: SELF_EMAIL ist eine reine
  // Dev-/Transport-Adresse, nicht zwingend eine, unter der Broker die Person
  // kennen.
  senderEmail: string;
  // Identifikationsadressen fuers customer_profile -- unter diesen (echten,
  // lange genutzten) Adressen finden reale Broker die Person. Fallback:
  // [senderEmail], wenn SELF_IDENTITY_EMAILS nicht gesetzt ist.
  identityEmails: string[];
}

// Zerlegt eine kommaseparierte Liste, trimmt und verwirft leere Eintraege.
function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Liest die fuenf Pflicht-SELF_*-Variablen und wirft mit der Liste ALLER
// fehlenden -- kein Teil-Seed mit halbem Profil. SELF_IDENTITY_EMAILS ist
// optional (Fallback auf SELF_EMAIL).
export function readSelfProfileEnv(): SelfProfileEnv {
  const { SELF_NAME, SELF_STREET, SELF_POSTAL_CODE, SELF_CITY, SELF_EMAIL, SELF_IDENTITY_EMAILS } =
    env;

  if (!SELF_NAME || !SELF_STREET || !SELF_POSTAL_CODE || !SELF_CITY || !SELF_EMAIL) {
    const missing = (
      [
        ["SELF_NAME", SELF_NAME],
        ["SELF_STREET", SELF_STREET],
        ["SELF_POSTAL_CODE", SELF_POSTAL_CODE],
        ["SELF_CITY", SELF_CITY],
        ["SELF_EMAIL", SELF_EMAIL],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([key]) => key);
    throw new Error(
      `Self-Profile-Seed abgebrochen — fehlende Env-Variablen: ${missing.join(", ")}. Alle fuenf SELF_*-Variablen lokal in .env setzen (siehe .env.example).`,
    );
  }

  const parsedIdentity = SELF_IDENTITY_EMAILS ? parseEmailList(SELF_IDENTITY_EMAILS) : [];
  const identityEmails = parsedIdentity.length > 0 ? parsedIdentity : [SELF_EMAIL];

  return {
    name: SELF_NAME,
    street: SELF_STREET,
    postalCode: SELF_POSTAL_CODE,
    city: SELF_CITY,
    senderEmail: SELF_EMAIL,
    identityEmails,
  };
}
