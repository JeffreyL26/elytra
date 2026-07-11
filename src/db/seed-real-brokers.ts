import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { realBrokers } from "@/db/real-brokers-data";
import { brokers } from "@/db/schema";

// Idempotent: pro Broker auf slug pruefen, dann update statt insert.
// responsiveness_tier und last_response_at sind worker-verwaltete
// Laufzeitfelder -- beim Update bewusst NICHT ueberschrieben, damit ein
// Re-Seed keinen real beobachteten Antwort-Status zuruecksetzt.
async function seedRealBrokers() {
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
