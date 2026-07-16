import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { customerProfiles, users } from "@/db/schema";
import { readSelfProfileEnv, splitName } from "@/db/self-profile-env";
import { parseCustomerProfile } from "@/lib/customer-profile-schema";

// Seed fuer das Self-Request-Testprofil (Phase 3b.4.5). Liest AUSSCHLIESSLICH
// aus Env (SELF_*) -- keine personenbezogenen Daten im Repo. Legt user +
// customer_profile an; bewusst KEINEN opt_out_process, der entsteht erst
// beim Trigger (3b.5). Idempotent: Lookup ueber SELF_EMAIL, update statt
// insert. PII wird nicht geloggt.
//
// Validiert gegen customerProfileSchema -- denselben Invarianten wie die
// kuenftige Profil-API (Spec § 2.2). Der Seed bleibt Dev-/Test-Werkzeug, ist
// aber kein laxerer Schreibweg.

async function seedSelfProfile(): Promise<void> {
  const self = readSelfProfileEnv();
  const { firstName, lastName } = splitName(self.name);

  // Validierung VOR jedem Schreibzugriff -- kein halbgueltiges Profil in der DB.
  const profileData = parseCustomerProfile(
    {
      firstName,
      lastName,
      // Identifikationsadressen (Broker finden die Person darunter), nicht die
      // Absenderadresse.
      emailAddresses: self.identityEmails,
      // Zielmarkt Deutschland; das Testprofil ist eine deutsche Anschrift.
      postalAddresses: [
        { street: self.street, postalCode: self.postalCode, city: self.city, country: "DE" },
      ],
    },
    "Self-Profile-Seed abgebrochen",
  );

  // Account-/Lookup-Key ist die Absenderadresse (SELF_EMAIL).
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, self.senderEmail))
    .limit(1);

  if (existingUser) {
    const [existingProfile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, existingUser.id))
      .limit(1);

    if (existingProfile) {
      await db
        .update(customerProfiles)
        .set({ ...profileData, updatedAt: new Date() })
        .where(eq(customerProfiles.id, existingProfile.id));
      console.log(`Self-Profile aktualisiert (user ${existingUser.id}).`);
    } else {
      await db.insert(customerProfiles).values({ userId: existingUser.id, ...profileData });
      console.log(`Self-Profile ergaenzt (user ${existingUser.id}).`);
    }
    return;
  }

  const [user] = await db
    .insert(users)
    .values({ email: self.senderEmail })
    .returning({ id: users.id });
  await db.insert(customerProfiles).values({ userId: user.id, ...profileData });
  console.log(`Self-Profile neu angelegt (user ${user.id}).`);
}

seedSelfProfile()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(
      "Self-Profile-Seed fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    await sql.end();
    process.exit(1);
  });
