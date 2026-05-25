import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { createId } from "@/lib/ids";
import { sendOptOutMail } from "@/worker/jobs/send-opt-out-mail";

let userId: string;
let processId: string;

beforeAll(async () => {
  const emailDummy = dummyBrokers.find((b) => b.slug === "dummy-broker-email");
  if (!emailDummy) {
    throw new Error("Fixture dummy-broker-email fehlt");
  }
  const [broker] = await db
    .insert(brokers)
    .values(emailDummy)
    .onConflictDoUpdate({ target: brokers.slug, set: { isDummy: true } })
    .returning();

  const [user] = await db
    .insert(users)
    .values({ email: `test-${createId()}@example.com` })
    .returning();
  userId = user.id;

  await db.insert(customerProfiles).values({
    userId,
    firstName: "Test",
    lastName: "Person",
    emailAddresses: ["test.person@example.com"],
    postalAddresses: [{ street: "Teststr. 1", postalCode: "10115", city: "Berlin", country: "DE" }],
  });

  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId, brokerId: broker.id })
    .returning();
  processId = proc.id;
});

afterAll(async () => {
  // opt_out_processes zuerst (cascade auf events + mails), dann user
  // (cascade auf profile). Broker bleibt -- ist geteiltes Fixture.
  await db.delete(optOutProcesses).where(eq(optOutProcesses.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await sql.end();
});

describe("sendOptOutMail (integration)", () => {
  it("sendet im Dummy-Modus und persistiert Mail, Event und Status", async () => {
    await sendOptOutMail(processId);

    const mails = await db.select().from(processMails).where(eq(processMails.processId, processId));
    expect(mails).toHaveLength(1);
    expect(mails[0].direction).toBe("outbound");
    expect(mails[0].providerMessageId).toMatch(/^dummy-/);
    expect(mails[0].sentAt).not.toBeNull();

    const events = await db
      .select()
      .from(processEvents)
      .where(eq(processEvents.processId, processId));
    expect(events.some((e) => e.eventType === "mail_sent")).toBe(true);

    const [proc] = await db.select().from(optOutProcesses).where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("contacted");
  });
});
