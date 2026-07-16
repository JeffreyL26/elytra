import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "@/db/client";
import { brokers, customerProfiles, optOutProcesses, processMails, users } from "@/db/schema";
import { createId, createProcessToken } from "@/lib/ids";
import {
  getProcessesForUser,
  getProcessMailsForUser,
  getProfileForUser,
} from "@/lib/user-data-access";

// Mandantentrennung ist die eine Sache, die man nicht verbocken darf
// (Spec § 2.3). Aufbau: zwei vollstaendige Mandanten (User + Profil + Prozess
// + Inbound-Mail); jede Assertion prueft, dass A nie etwas von B sieht.

// Eigener Broker-Slug, damit dieser Test nicht mit den Dummy-Fixtures anderer
// Test-Dateien kollidiert (Vitest laeuft Dateien parallel).
const BROKER_SLUG = `test-tenant-isolation-${createId().slice(0, 8)}`;

interface Tenant {
  userId: string;
  profileId: string;
  processId: string;
  mailId: string;
}

let brokerId: string;
let tenantA: Tenant;
let tenantB: Tenant;

async function createTenant(label: string): Promise<Tenant> {
  const [user] = await db
    .insert(users)
    .values({ email: `tenant-${label}-${createId()}@example.org` })
    .returning({ id: users.id });

  const [profile] = await db
    .insert(customerProfiles)
    .values({
      userId: user.id,
      firstName: `Vorname${label}`,
      lastName: `Nachname${label}`,
      emailAddresses: [`identity-${label}@example.org`],
      postalAddresses: [
        { street: `${label}-Straße 1`, postalCode: "12345", city: "Musterstadt", country: "DE" },
      ],
    })
    .returning({ id: customerProfiles.id });

  const [proc] = await db
    .insert(optOutProcesses)
    .values({
      userId: user.id,
      brokerId,
      processToken: createProcessToken(),
      status: "contacted",
    })
    .returning({ id: optOutProcesses.id });

  const [mail] = await db
    .insert(processMails)
    .values({
      processId: proc.id,
      direction: "inbound",
      providerMessageId: `tenant-${label}-${createId()}`,
      fromAddress: "support@broker.example",
      toAddress: `proc-token@reply.example`,
      subject: `Antwort fuer ${label}`,
      bodyText: `Geheim fuer ${label}`,
      receivedAt: new Date(),
    })
    .returning({ id: processMails.id });

  return { userId: user.id, profileId: profile.id, processId: proc.id, mailId: mail.id };
}

beforeAll(async () => {
  const [broker] = await db
    .insert(brokers)
    .values({
      slug: BROKER_SLUG,
      name: "Test Tenant Isolation Broker",
      optOutMethod: "email",
      optOutEmail: "privacy@tenant-isolation.example",
      language: "de",
      isDummy: true,
      isActive: false,
    })
    .returning({ id: brokers.id });
  brokerId = broker.id;

  tenantA = await createTenant("A");
  tenantB = await createTenant("B");
});

afterAll(async () => {
  const userIds = [tenantA?.userId, tenantB?.userId].filter(Boolean) as string[];
  if (userIds.length > 0) {
    // opt_out_processes cascaded auf mails/events; users cascaded auf profile.
    await db.delete(optOutProcesses).where(inArray(optOutProcesses.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
  if (brokerId) {
    await db.delete(brokers).where(eq(brokers.id, brokerId));
  }
  await sql.end();
});

describe("getProfileForUser", () => {
  it("liefert das eigene Profil", async () => {
    const profile = await getProfileForUser(tenantA.userId);
    expect(profile?.id).toBe(tenantA.profileId);
    expect(profile?.firstName).toBe("VornameA");
  });

  it("liefert NIE das Profil eines anderen Users", async () => {
    const profile = await getProfileForUser(tenantA.userId);
    expect(profile?.id).not.toBe(tenantB.profileId);
    expect(profile?.firstName).not.toBe("VornameB");
  });

  it("liefert null fuer eine unbekannte userId (kein Leak, Not-Found)", async () => {
    expect(await getProfileForUser(createId())).toBeNull();
  });
});

describe("getProcessesForUser", () => {
  it("liefert nur die eigenen Prozesse", async () => {
    const processes = await getProcessesForUser(tenantA.userId);
    expect(processes.map((p) => p.id)).toEqual([tenantA.processId]);
    expect(processes.every((p) => p.userId === tenantA.userId)).toBe(true);
  });

  it("enthaelt NIE den Prozess eines anderen Users", async () => {
    const processes = await getProcessesForUser(tenantA.userId);
    expect(processes.map((p) => p.id)).not.toContain(tenantB.processId);
  });

  it("liefert leer fuer eine unbekannte userId", async () => {
    expect(await getProcessesForUser(createId())).toEqual([]);
  });
});

describe("getProcessMailsForUser", () => {
  it("liefert nur die Mails der eigenen Prozesse", async () => {
    const mails = await getProcessMailsForUser(tenantA.userId);
    expect(mails.map((m) => m.id)).toEqual([tenantA.mailId]);
    expect(mails.map((m) => m.id)).not.toContain(tenantB.mailId);
  });

  it("filtert optional auf einen eigenen Prozess", async () => {
    const mails = await getProcessMailsForUser(tenantA.userId, tenantA.processId);
    expect(mails.map((m) => m.id)).toEqual([tenantA.mailId]);
  });

  // Kern der Regel: der processId-Filter ist optional, der Ownership-Check nicht.
  it("gibt mit FREMDER processId nichts heraus (Ownership-Check greift)", async () => {
    const mails = await getProcessMailsForUser(tenantA.userId, tenantB.processId);
    expect(mails).toEqual([]);
  });

  it("liefert B seine eigene Mail (Gegenprobe: Filter ist nicht generell leer)", async () => {
    const mails = await getProcessMailsForUser(tenantB.userId, tenantB.processId);
    expect(mails.map((m) => m.id)).toEqual([tenantB.mailId]);
  });

  it("liefert leer fuer eine unbekannte userId", async () => {
    expect(await getProcessMailsForUser(createId())).toEqual([]);
  });

  it("liefert nicht zugeordnete Inbound-Mails (process_id NULL) an niemanden aus", async () => {
    const [orphan] = await db
      .insert(processMails)
      .values({
        direction: "inbound",
        providerMessageId: `orphan-${createId()}`,
        fromAddress: "fremd@nirgendwo.example",
        toAddress: "unbekannt@reply.example",
        subject: "Nicht zugeordnet",
        receivedAt: new Date(),
      })
      .returning({ id: processMails.id });

    try {
      const forA = await getProcessMailsForUser(tenantA.userId);
      const forB = await getProcessMailsForUser(tenantB.userId);
      expect(forA.map((m) => m.id)).not.toContain(orphan.id);
      expect(forB.map((m) => m.id)).not.toContain(orphan.id);
    } finally {
      await db.delete(processMails).where(eq(processMails.id, orphan.id));
    }
  });
});
