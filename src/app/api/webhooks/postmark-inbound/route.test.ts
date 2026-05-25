import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// env + producer mocken, bevor die Route sie (transitiv) importiert.
const { mockEnv, enqueueMock } = vi.hoisted(() => ({
  mockEnv: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    POSTMARK_INBOUND_WEBHOOK_USERNAME: "hookuser" as string | undefined,
    POSTMARK_INBOUND_WEBHOOK_PASSWORD: "hookpass" as string | undefined,
  },
  enqueueMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/worker/producer", () => ({
  enqueue: enqueueMock,
  PROCESS_INBOUND_MAIL_QUEUE: "process-inbound-mail",
}));

import { POST } from "@/app/api/webhooks/postmark-inbound/route";
import { db, sql } from "@/db/client";
import { processMails } from "@/db/schema";

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function makeRequest(opts: { auth?: string; body?: unknown }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth) {
    headers.authorization = opts.auth;
  }
  return new Request("http://localhost/api/webhooks/postmark-inbound", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

function validPayload(messageId: string) {
  return {
    MessageID: messageId,
    From: "broker@broker.example",
    FromName: "Broker Support",
    To: "proc-test1234abcd5678@reply.jba-team.com",
    ToFull: [{ Email: "proc-test1234abcd5678@reply.jba-team.com", Name: "" }],
    Subject: "Re: [Ref: test1234abcd5678] Datenlöschanfrage",
    TextBody: "Wir haben die Daten geloescht.",
    HtmlBody: "<p>Wir haben die Daten geloescht.</p>",
    Headers: [{ Name: "In-Reply-To", Value: "<outbound-msg-id@ses>" }],
    Date: "Mon, 25 May 2026 12:00:00 +0000",
    UnknownField: "should pass through",
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockEnv.POSTMARK_INBOUND_WEBHOOK_USERNAME = "hookuser";
  mockEnv.POSTMARK_INBOUND_WEBHOOK_PASSWORD = "hookpass";
  await db.delete(processMails).where(like(processMails.providerMessageId, "test-inbound-%"));
});

afterAll(async () => {
  await db.delete(processMails).where(like(processMails.providerMessageId, "test-inbound-%"));
  await sql.end();
});

describe("POST /api/webhooks/postmark-inbound", () => {
  it("Auth-Header fehlt -> 401, kein Enqueue", async () => {
    const res = await POST(makeRequest({ body: validPayload("test-inbound-1") }));
    expect(res.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("Auth falsch -> 401, kein Enqueue", async () => {
    const res = await POST(
      makeRequest({
        auth: basicAuth("wrong", "creds"),
        body: validPayload("test-inbound-2"),
      }),
    );
    expect(res.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("Auth korrekt -> 200, Inbound gespeichert (process_id NULL), Enqueue", async () => {
    const res = await POST(
      makeRequest({
        auth: basicAuth("hookuser", "hookpass"),
        body: validPayload("test-inbound-correct"),
      }),
    );
    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      "process-inbound-mail",
      expect.objectContaining({ mailId: expect.any(String) }),
    );

    const rows = await db
      .select()
      .from(processMails)
      .where(eq(processMails.providerMessageId, "test-inbound-correct"));
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe("inbound");
    expect(rows[0].processId).toBeNull();
    expect(rows[0].headers).toMatchObject({
      "In-Reply-To": "<outbound-msg-id@ses>",
    });
    expect(rows[0].rawPayload).toMatchObject({
      UnknownField: "should pass through",
    });
  });

  it("Auth korrekt + invalides Payload -> 400, kein Enqueue", async () => {
    const res = await POST(
      makeRequest({
        auth: basicAuth("hookuser", "hookpass"),
        body: { foo: "bar" },
      }),
    );
    expect(res.status).toBe(400);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("Duplikat -> beide 200, aber nur einmal Enqueue und eine Zeile", async () => {
    const first = await POST(
      makeRequest({
        auth: basicAuth("hookuser", "hookpass"),
        body: validPayload("test-inbound-dup"),
      }),
    );
    const second = await POST(
      makeRequest({
        auth: basicAuth("hookuser", "hookpass"),
        body: validPayload("test-inbound-dup"),
      }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);

    const rows = await db
      .select()
      .from(processMails)
      .where(eq(processMails.providerMessageId, "test-inbound-dup"));
    expect(rows).toHaveLength(1);
  });

  it("Credentials nicht gesetzt -> 500, kein Enqueue", async () => {
    mockEnv.POSTMARK_INBOUND_WEBHOOK_USERNAME = undefined;
    mockEnv.POSTMARK_INBOUND_WEBHOOK_PASSWORD = undefined;
    const res = await POST(
      makeRequest({
        auth: basicAuth("hookuser", "hookpass"),
        body: validPayload("test-inbound-3"),
      }),
    );
    expect(res.status).toBe(500);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
