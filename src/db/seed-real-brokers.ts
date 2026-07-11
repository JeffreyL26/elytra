import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { realBrokers } from "@/db/real-brokers-data";
import { brokers } from "@/db/schema";

// country ist im Schema nur text() ohne Constraint. Diese Pre-Seed-Pruefung
// faengt ungueltige Codes (z. B. "ALL") beim Seeden ab, statt sie erst im
// Versand auffallen zu lassen. Erwartet ISO-3166-1-alpha-2: genau 2 Zeichen,
// uppercase A-Z. null/undefined ist erlaubt (country ist nullable).
function assertValidCountries(): void {
  const invalid = realBrokers
    .filter((b) => b.country != null && !/^[A-Z]{2}$/.test(b.country))
    .map((b) => `${b.slug}="${b.country}"`);
  if (invalid.length > 0) {
    throw new Error(
      `Ungueltige country-Codes (erwartet ISO-3166-1-alpha-2, 2x uppercase): ${invalid.join(", ")}`,
    );
  }
}

// Idempotent: pro Broker auf slug pruefen, dann update statt insert.
// responsiveness_tier und last_response_at sind worker-verwaltete
// Laufzeitfelder -- beim Update bewusst NICHT ueberschrieben, damit ein
// Re-Seed keinen real beobachteten Antwort-Status zuruecksetzt.
async function seedRealBrokers() {
  assertValidCountries();

  let insertedCount = 0;
  let updatedCount = 0;

  for (const broker of realBrokers) {
    const existing = await db
      .select({ id: brokers.id })
      .from(brokers)
      .where(eq(brokers.slug, broker.slug))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(brokers)
        .set({
          name: broker.name,
          country: broker.country,
          websiteUrl: broker.websiteUrl,
          optOutMethod: broker.optOutMethod,
          optOutEmail: broker.optOutEmail,
          optOutFormUrl: broker.optOutFormUrl ?? null,
          language: broker.language,
          requiresAuthorizationAttachment: broker.requiresAuthorizationAttachment,
          isDummy: broker.isDummy,
          isActive: broker.isActive,
          notes: broker.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(brokers.slug, broker.slug));
      updatedCount++;
      console.log(`  ~ ${broker.slug} (aktualisiert)`);
    } else {
      await db.insert(brokers).values(broker);
      insertedCount++;
      console.log(`  + ${broker.slug} (neu)`);
    }
  }

  console.log(
    `Real-Broker-Seed abgeschlossen: ${insertedCount} neu, ${updatedCount} aktualisiert, ${realBrokers.length} gesamt.`,
  );
}

seedRealBrokers()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("Real-Broker-Seed fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
