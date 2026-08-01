import { desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mail/send-customer", () => ({
  sendCustomerMail: async () => ({ delivered: false, stream: null }),
  missingCustomerStreamEnv: () => [],
  warnIfCustomerStreamMissing: () => {},
}));

import { POST } from "@/app/api/elytra/processes/[processId]/resolve/route";
import { db, sql } from "@/db/client";
import { brokers, optOutProcesses, processEvents, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { createId, createProcessToken } from "@/lib/ids";
import { MANUAL_RESOLUTION_REASON, resolveProcessManually } from "@/lib/manual-resolution";
import { resolveTransition } from "@/lib/status-transitions";

const DOMAIN = "manualtest.local";
const BROKER_SLUG = `test-manual-${createId().slice(0, 8)}`;
const STRONG = "Sicher1!Passw0rt";

let brokerId: string;
let adminUserId: string;
let adminHeaders: Headers;
let plainHeaders: Headers;
const userIds: string[] = [];

async function signUp(): Promise<{ userId: string; headers: Headers }> {
  const email = `manual-${createId().slice(0, 10)}@${DOMAIN}`;
  const res = await auth.api.signUpEmail({
    body: { email, password: STRONG, name: "T" },
    asResponse: true,
  });
  const headers = new Headers({
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) {
    throw new Error("Signup ohne User");
  }
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, row.id));
  userIds.push(row.id);
  return { userId: row.id, headers };
}

async function createProcess(status: "in_progress" | "contacted" | "no_data_held") {
  const [user] = await db
    .insert(users)
    .values({ email: `proc-${createId()}@${DOMAIN}` })
    .returning({ id: users.id });
  userIds.push(user.id);
  const [proc] = await db
    .insert(optOutProcesses)
    .values({ userId: user.id, brokerId, processToken: createProcessToken(), status })
    .returning({ id: optOutProcesses.id });
  return proc.id;
}

function makeRequest(headers: Headers, body: unknown): Request {
  return new Request("http://localhost/api/elytra/processes/x/resolve", {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      cookie: headers.get("cookie") ?? "",
    }),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [broker] = await db
    .insert(brokers)
    .values({
      slug: BROKER_SLUG,
      name: "Manual Test Broker",
      optOutMethod: "email",
      isDummy: true,
      isActive: false,
    })
    .returning({ id: brokers.id });
  brokerId = broker.id;

  const admin = await signUp();
  adminUserId = admin.userId;
  adminHeaders = admin.headers;
  await db.update(users).set({ isAdmin: true }).where(eq(users.id, adminUserId));

  const plain = await signUp();
  plainHeaders = plain.headers;
});

afterAll(async () => {
  await db.delete(optOutProcesses).where(inArray(optOutProcesses.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(brokers).where(eq(brokers.id, brokerId));
  await sql.end();
});

async function lastStatusEvent(processId: string) {
  const [row] = await db
    .select({ payload: processEvents.payload })
    .from(processEvents)
    .where(eq(processEvents.processId, processId))
    .orderBy(desc(processEvents.createdAt))
    .limit(1);
  return (row?.payload ?? {}) as Record<string, unknown>;
}

describe("Manueller Abschluss — Audit-Trail", () => {
  it("in_progress -> no_data_held: Status gesetzt, Event mit Grund, Quelle und Bearbeiter", async () => {
    const processId = await createProcess("in_progress");

    const result = await resolveProcessManually({
      processId,
      targetStatus: "no_data_held",
      note: "Kunde hat den Brief von ABIS weitergeleitet.",
      knowledgeSource: "customer_report",
      adminUserId,
    });
    expect(result).toEqual({ ok: true, from: "in_progress", to: "no_data_held" });

    const [proc] = await db
      .select({ status: optOutProcesses.status })
      .from(optOutProcesses)
      .where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("no_data_held");

    const payload = await lastStatusEvent(processId);
    expect(payload.reason).toBe(MANUAL_RESOLUTION_REASON);
    // Erkenntnisquelle ist ein SEPARATES Feld, nicht in reason gemischt.
    expect(payload.knowledgeSource).toBe("customer_report");
    expect(payload.reason).not.toContain("customer_report");
    expect(payload.adminUserId).toBe(adminUserId);
    expect(payload.note).toBe("Kunde hat den Brief von ABIS weitergeleitet.");
    expect(payload.from).toBe("in_progress");
    expect(payload.to).toBe("no_data_held");
  });

  it("fehlende Begruendung -> abgelehnt, Status unveraendert", async () => {
    const processId = await createProcess("contacted");
    const result = await resolveProcessManually({
      processId,
      targetStatus: "success",
      note: "   ",
      knowledgeSource: "self_document",
      adminUserId,
    });
    expect(result).toEqual({ ok: false, error: "note_required" });

    const [proc] = await db
      .select({ status: optOutProcesses.status })
      .from(optOutProcesses)
      .where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("contacted");
  });

  it("ungueltige Erkenntnisquelle -> abgelehnt", async () => {
    const processId = await createProcess("contacted");
    const result = await resolveProcessManually({
      processId,
      targetStatus: "success",
      note: "Beleg liegt vor",
      knowledgeSource: "erfunden" as never,
      adminUserId,
    });
    expect(result).toEqual({ ok: false, error: "invalid_knowledge_source" });
  });

  it("nicht-terminaler Zielstatus -> abgelehnt (nur success/no_data_held/blacklisted)", async () => {
    const processId = await createProcess("contacted");
    const result = await resolveProcessManually({
      processId,
      targetStatus: "manual_review" as never,
      note: "x",
      knowledgeSource: "other",
      adminUserId,
    });
    expect(result).toEqual({ ok: false, error: "invalid_status" });
  });
});

describe("Abgrenzung: manueller Eingriff vs. automatische Konfliktregel", () => {
  it("Sachbearbeiter darf terminalen Status ueberschreiben, Automatik eskaliert weiterhin", async () => {
    // Ein bereits terminaler Vorgang.
    const processId = await createProcess("no_data_held");

    // (1) AUTOMATIK: eine widersprechende Klassifikation eskaliert -> conflict.
    const automatic = resolveTransition("no_data_held", "success");
    expect(automatic).toEqual({ next: "manual_review", kind: "conflict" });

    // (2) MENSCH: derselbe Wechsel im manuellen Kontext setzt durch.
    const manual = resolveTransition("no_data_held", "success", "manual");
    expect(manual).toEqual({ next: "success", kind: "set" });

    // Und end-to-end ueber die Abschluss-Funktion:
    const result = await resolveProcessManually({
      processId,
      targetStatus: "success",
      note: "Broker hat die Löschung nachträglich schriftlich bestätigt.",
      knowledgeSource: "self_document",
      adminUserId,
    });
    expect(result).toEqual({ ok: true, from: "no_data_held", to: "success" });

    const [proc] = await db
      .select({ status: optOutProcesses.status })
      .from(optOutProcesses)
      .where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("success");
  });
});

describe("POST /api/elytra/processes/[processId]/resolve — Autorisierung", () => {
  it("ohne Session -> 404", async () => {
    const processId = await createProcess("contacted");
    const res = await POST(
      makeRequest(new Headers(), {
        targetStatus: "success",
        note: "x",
        knowledgeSource: "other",
      }),
      { params: Promise.resolve({ processId }) },
    );
    expect(res.status).toBe(404);
  });

  it("Nicht-Admin -> 404 (keine Existenz-Preisgabe), nichts geaendert", async () => {
    const processId = await createProcess("contacted");
    const res = await POST(
      makeRequest(plainHeaders, {
        targetStatus: "success",
        note: "unbefugt",
        knowledgeSource: "other",
      }),
      { params: Promise.resolve({ processId }) },
    );
    expect(res.status).toBe(404);

    const [proc] = await db
      .select({ status: optOutProcesses.status })
      .from(optOutProcesses)
      .where(eq(optOutProcesses.id, processId));
    expect(proc.status).toBe("contacted");
  });

  it("Admin -> 200 und Status gesetzt", async () => {
    const processId = await createProcess("contacted");
    const res = await POST(
      makeRequest(adminHeaders, {
        targetStatus: "blacklisted",
        note: "Broker bestätigt Werbesperre telefonisch.",
        knowledgeSource: "self_document",
      }),
      { params: Promise.resolve({ processId }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ from: "contacted", to: "blacklisted" });
  });

  it("Admin ohne Begruendung -> 400 validation_failed", async () => {
    const processId = await createProcess("contacted");
    const res = await POST(
      makeRequest(adminHeaders, {
        targetStatus: "success",
        note: "",
        knowledgeSource: "self_document",
      }),
      { params: Promise.resolve({ processId }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("Admin ohne Erkenntnisquelle -> 400 validation_failed", async () => {
    const processId = await createProcess("contacted");
    const res = await POST(
      makeRequest(adminHeaders, { targetStatus: "success", note: "Beleg liegt vor" }),
      { params: Promise.resolve({ processId }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });
});
