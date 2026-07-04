import { env } from "@/lib/env";

// Self-Request-Testprofil aus Env (Phase 3b.4.5). Eigene Datei statt Teil
// des Seed-Scripts, damit die Validierung testbar ist, ohne dass der Import
// einen DB-Seed anstoesst.
export interface SelfProfileEnv {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
}

// Liest die fuenf SELF_*-Variablen und wirft mit der Liste ALLER fehlenden
// Variablen -- kein Teil-Seed mit halbem Profil.
export function readSelfProfileEnv(): SelfProfileEnv {
  const { SELF_NAME, SELF_STREET, SELF_POSTAL_CODE, SELF_CITY, SELF_EMAIL } = env;

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

  return {
    name: SELF_NAME,
    street: SELF_STREET,
    postalCode: SELF_POSTAL_CODE,
    city: SELF_CITY,
    email: SELF_EMAIL,
  };
}
