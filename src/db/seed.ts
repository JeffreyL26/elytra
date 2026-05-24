import { dummyBrokers } from "@/data/dummy-brokers";
import { db, sql } from "@/db/client";
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
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("Seed fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
