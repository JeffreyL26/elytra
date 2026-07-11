import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { brokers } from "@/db/schema";

// Loopback-Test-Broker (Phase 3b.5a): ein "Broker", dessen opt_out_email die
// eigene kontrollierte Adresse ist -- voller Postmark-Roundtrip ohne echten
// Empfaenger. Die Adresse kommt zur Laufzeit als CLI-Argument (keine PII im
// Repo):
//
//   pnpm db:seed:loopback -- deine-adresse@example.org
//
// is_dummy=false (sonst kein echter Postmark-Call, kein Roundtrip),
// is_active=false (geraet nie in automatische Runden; Ansteuerung nur explizit
// per Slug ueber trigger-real-send). Idempotent ueber den festen Slug.

export const LOOPBACK_SLUG = "loopback-test";

async function seedLoopbackBroker(): Promise<void> {
  // pnpm reicht ein literales "--" als Argument durch -- ueberspringen.
  const email = process.argv.slice(2).find((arg) => arg !== "--");
  if (!email?.includes("@")) {
    console.error(
      "Usage: pnpm db:seed:loopback <eigene-test-adresse>\n" +
        "Die Adresse wird als opt_out_email des Loopback-Brokers gesetzt.",
    );
    process.exit(1);
  }

  const data = {
    name: "Loopback Test (eigene Adresse)",
    country: "DE",
    optOutMethod: "email",
    optOutEmail: email,
    language: "de",
    isDummy: false,
    isActive: false,
    notes:
      "Loopback-Test-Broker (3b.5a): eigene kontrollierte Adresse fuer den Roundtrip-Test. is_active MUSS false bleiben — nie in echte Runden aufnehmen.",
  } as const;

  const [existing] = await db
    .select({ id: brokers.id })
    .from(brokers)
    .where(eq(brokers.slug, LOOPBACK_SLUG))
    .limit(1);

  if (existing) {
    await db
      .update(brokers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brokers.id, existing.id));
    console.log(`Loopback-Broker aktualisiert (slug=${LOOPBACK_SLUG}).`);
  } else {
    await db.insert(brokers).values({ slug: LOOPBACK_SLUG, ...data });
    console.log(`Loopback-Broker angelegt (slug=${LOOPBACK_SLUG}).`);
  }
}

seedLoopbackBroker()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("Loopback-Seed fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
