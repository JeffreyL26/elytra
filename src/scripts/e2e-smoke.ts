import { and, eq } from "drizzle-orm";
import { POST } from "@/app/api/webhooks/postmark-inbound/route";
import { dummyBrokers } from "@/data/dummy-brokers";
import { db, sql } from "@/db/client";
import {
  brokers,
  customerProfiles,
  optOutProcesses,
  processEvents,
  processMails,
  users,
} from "@/db/schema";
import { env } from "@/lib/env";
import { createId } from "@/lib/ids";
import { processInboundMail } from "@/worker/jobs/process-inbound-mail";
import { sendOptOutMail } from "@/worker/jobs/send-opt-out-mail";
import { PROCESS_INBOUND_MAIL_QUEUE } from "@/worker/producer";

// Lokaler End-to-End-Smoke-Test gegen einen Dummy-Broker (kein echter SES-,
// Postmark- oder LLM-Verkehr, ausser ANTHROPIC_API_KEY ist gesetzt). Durchlaeuft
// die komplette Phase-2-Pipeline in einem Prozess und gibt Status + Events aus.

function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (!value || typeof value !== "string") {
    throw new Error(`${name} fehlt in .env -- fuer den Smoke-Test erforderlich.`);
  }
  return value;
}

async function main(): Promise<void> {
  const replyDomain = requireEnv("REPLY_DOMAIN");
  const webhookUser = requireEnv("POSTMARK_INBOUND_WEBHOOK_USERNAME");
  const webhookPass = requireEnv("POSTMARK_INBOUND_WEBHOOK_PASSWORD");
  requireEnv("MAIL_FROM_ADDRESS");

  // 1. Dummy-Broker sicherstellen.
  const emailDummy = dummyBrokers.find((b) => b.slug === "dummy-broker-email");
  if (!emailDummy) {
    throw new Error("Fixture dummy-broker-email fehlt.");
  }
  const [broker] = await db
    .insert(brokers)
    .values(emailDummy)
    .onConflictDoUpdate({ target: brokers.slug, set: { isDummy: true } })
    .returning();

  // 2. Test-User + Profil + Prozess.
  const [user] = await db
    .insert(users)
    .values({ email: `e2e-${createId()}@example.com` })
    .returning();
  await db.insert(customerProfiles).values({
    userId: user.id,
    firstName: "Erika",
    lastName: "Mustermann",
    emailAddresses: ["erika.mustermann@example.com"],
    postalAddresses: [
      { street: "Musterstr. 1", postalCode: "10115", city: "Berlin", country: "DE" },
    ],
  });
  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId: user.id, brokerId: broker.id })
    .returning();
  console.log(
    `[1] Prozess ${proc.id} angelegt (Token ${proc.processToken}, Status ${proc.status}).`,
  );

  // 3. Outbound senden (Dummy-Modus, kein echter SES-Call).
  await sendOptOutMail(proc.id);
  const [outbound] = await db
    .select()
    .from(processMails)
    .where(and(eq(processMails.processId, proc.id), eq(processMails.direction, "outbound")));
  console.log(`[2] Outbound gesendet (Message-ID ${outbound?.providerMessageId}).`);

  // 4. Inbound-Antwort des Brokers simulieren -- echter POST an den Webhook-Handler.
  const inboundMessageId = `inbound-${createId()}@broker.example`;
  const payload = {
    MessageID: inboundMessageId,
    From: broker.optOutEmail,
    To: `proc-${proc.processToken}@${replyDomain}`,
    ToFull: [{ Email: `proc-${proc.processToken}@${replyDomain}`, Name: "" }],
    Subject: `Re: [Ref: ${proc.processToken}] Datenlöschanfrage`,
    TextBody:
      "Sehr geehrte Damen und Herren, wir haben saemtliche Daten der betroffenen Person vollstaendig geloescht. Mit freundlichen Gruessen",
    HtmlBody: "<p>Wir haben saemtliche Daten vollstaendig geloescht.</p>",
    Headers: [{ Name: "In-Reply-To", Value: outbound?.providerMessageId ?? "" }],
    Date: new Date().toUTCString(),
  };
  const auth = `Basic ${Buffer.from(`${webhookUser}:${webhookPass}`).toString("base64")}`;
  const response = await POST(
    new Request("http://localhost/api/webhooks/postmark-inbound", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify(payload),
    }),
  );
  console.log(`[3] Webhook-POST beantwortet mit HTTP ${response.status}.`);

  // 5. Inbound-Job ausfuehren (der Webhook hat ihn enqueued; hier direkt drainen).
  const [inbound] = await db
    .select()
    .from(processMails)
    .where(eq(processMails.providerMessageId, inboundMessageId));
  if (!inbound) {
    throw new Error("Inbound-Mail wurde nicht gespeichert.");
  }
  await processInboundMail(inbound.id);

  // 6. Ergebnis ausgeben.
  const [finalProc] = await db
    .select()
    .from(optOutProcesses)
    .where(eq(optOutProcesses.id, proc.id));
  const events = await db
    .select()
    .from(processEvents)
    .where(eq(processEvents.processId, proc.id))
    .orderBy(processEvents.createdAt);
  console.log(`[4] Finaler Prozess-Status: ${finalProc?.status}`);
  console.log("[5] Event-Verlauf:");
  for (const event of events) {
    console.log(`      - ${event.eventType}`);
  }

  // 7. Aufraeumen: enqueued Job entfernen, dann Testdaten (Prozess kaskadiert
  //    Events + Mails, User kaskadiert Profil).
  await sql`DELETE FROM pgboss.job WHERE name = ${PROCESS_INBOUND_MAIL_QUEUE} AND data->>'processMailId' = ${inbound.id}`;
  await db.delete(optOutProcesses).where(eq(optOutProcesses.id, proc.id));
  await db.delete(users).where(eq(users.id, user.id));
  console.log("[6] Testdaten aufgeraeumt.");
}

main()
  .then(async () => {
    await sql.end();
    // Beendet auch den lazily gestarteten pg-boss-Producer (Webhook-Enqueue).
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("E2E-Smoke fehlgeschlagen:", error);
    await sql.end().catch(() => {});
    process.exit(1);
  });
