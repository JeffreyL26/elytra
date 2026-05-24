import { dummyBrokers } from "@/data/dummy-brokers";
import { db } from "@/db/client";
import { brokers } from "@/db/schema";

async function seed() {
  const inserted = await db
    .insert(brokers)
    .values(dummyBrokers)
    .onConflictDoNothing({ target: brokers.slug })
    .returning({ slug: brokers.slug });

  const skipped = dummyBrokers.length - inserted.length;
  console.log(
    `Seed abgeschlossen: ${inserted.length} neu eingefuegt, ${skipped} bereits vorhanden.`,
  );
  for (const broker of inserted) {
    console.log(`  + ${broker.slug}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed fehlgeschlagen:", error);
    process.exit(1);
  });
