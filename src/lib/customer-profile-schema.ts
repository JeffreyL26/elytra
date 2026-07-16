import { z } from "zod";

// Geteilte Profil-Invarianten (Spec docs/specs/multi-tenant-profile.md § 2.2).
//
// INVARIANTE: EINE Validierungsstelle fuer customer_profiles, geteilt von Seed
// und kuenftiger Profil-API. Ein self-service angelegtes Profil muss dieselben
// Invarianten erfuellen wie das Env-Seed-Profil -- sonst driften die beiden
// Schreibwege auseinander und wir versenden auf Basis unterschiedlich strenger
// Daten. Wer einen neuen Schreibpfad baut, validiert hier, nicht daneben.
//
// Das Profil ist die Identitaet gegenueber Brokern: nach diesen Daten suchen
// sie. Fehlerhafte Werte fallen deshalb bewusst beim SCHREIBEN auf, nicht erst
// beim Versand (gleiche Haltung wie assertValidCountries() im Broker-Seed).

export const postalAddressSchema = z.object({
  street: z.string().trim().min(1, "street darf nicht leer sein"),
  postalCode: z.string().trim().min(1, "postalCode darf nicht leer sein"),
  city: z.string().trim().min(1, "city darf nicht leer sein"),
  // ISO 3166-1 alpha-2, analog assertValidCountries() im Broker-Seed:
  // Konsistenz schlaegt Freitext.
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "country muss ISO-3166-1-alpha-2 sein (genau 2 Zeichen, uppercase)"),
});

export const customerProfileSchema = z.object({
  // Vor- UND Nachname sind Pflicht. Mononyme werden bewusst nicht unterstuetzt:
  // ein Broker-Lookup ohne Nachnamen ist wertlos, also soll gar kein Profil
  // ohne Nachnamen entstehen.
  firstName: z.string().trim().min(1, "firstName ist Pflicht"),
  lastName: z.string().trim().min(1, "lastName ist Pflicht (Mononyme nicht unterstuetzt)"),
  // Mindestens eine Adresse, und jede muss zustellbar aussehen: eine kaputte
  // Adresse im Profil ist ein stiller Fehlschlag gegenueber dem Broker.
  emailAddresses: z
    .array(z.string().email("emailAddresses enthaelt eine ungueltige E-Mail-Adresse"))
    .min(1, "mindestens eine E-Mail-Adresse ist Pflicht"),
  postalAddresses: z
    .array(postalAddressSchema)
    .min(1, "mindestens eine vollstaendige Postanschrift ist Pflicht"),
  // Optional (nullish: die DB-Spalten sind nullable, eine API darf null senden).
  phoneNumbers: z.array(z.string().trim().min(1, "Telefonnummer darf nicht leer sein")).nullish(),
  // date-Spalte liefert/erwartet "YYYY-MM-DD"; das Template zerlegt genau diese
  // Form (formatDateDe).
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth muss im Format YYYY-MM-DD vorliegen")
    .nullish(),
});

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;

// Validiert ein Profil und wirft mit benannten Feldern (ohne die Werte selbst
// zu nennen -- PII gehoert nicht in Logs).
export function parseCustomerProfile(input: unknown, context: string): CustomerProfileInput {
  const parsed = customerProfileSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${context} — ungueltiges Profil: ${issues}`);
  }
  return parsed.data;
}
