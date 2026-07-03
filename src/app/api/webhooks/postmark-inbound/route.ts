import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { processMails } from "@/db/schema";
import { env } from "@/lib/env";
import { parseInbound } from "@/lib/mail/parse-inbound";
import { enqueue, PROCESS_INBOUND_MAIL_QUEUE } from "@/worker/producer";

// DB-Zugriff zur Request-Zeit -> kein statisches Prerendering.
export const dynamic = "force-dynamic";

// Laengen-neutraler Vergleich: beide Seiten auf 32-Byte-SHA-256 bringen,
// dann timingSafeEqual. Kein Length-Leak, keine Exception bei Ungleichlaenge.
function safeEqual(a: string, b: string): boolean {
  const aHash = createHash("sha256").update(a).digest();
  const bHash = createHash("sha256").update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

// Rueckgabe: null = ok, sonst die zu sendende Fehler-Response.
function checkAuth(request: Request): Response | null {
  const username = env.POSTMARK_INBOUND_WEBHOOK_USERNAME;
  const password = env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;

  // Fehlkonfiguration (Server) -> 500, NICHT 200.
  if (!username || !password) {
    console.error("[postmark-inbound] webhook credentials not configured");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic" },
    });
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const providedUser = separator === -1 ? decoded : decoded.slice(0, separator);
  const providedPass = separator === -1 ? "" : decoded.slice(separator + 1);

  // Beide immer pruefen (kein Short-Circuit -> kein Timing-Leak).
  const userOk = safeEqual(providedUser, username);
  const passOk = safeEqual(providedPass, password);
  if (!userOk || !passOk) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Auth (fail-closed)
  const authError = checkAuth(request);
  if (authError) {
    return authError;
  }

  // 2. Payload validieren
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    console.warn("[postmark-inbound] body is not valid JSON");
    return new Response("Bad Request", { status: 400 });
  }
  const mail = parseInbound(rawBody);
  if (!mail) {
    console.warn("[postmark-inbound] payload failed schema validation");
    return new Response("Unprocessable Entity", { status: 400 });
  }

  // Logging: Metadaten, niemals der Body (der liegt sicher in der DB).
  console.log(
    `[postmark-inbound] ${new Date().toISOString()} auth=ok MessageID=${mail.messageId} From=${mail.fromAddress} To=${mail.toAddress} Subject=${JSON.stringify(mail.subject)} Attachments=${mail.attachments.length}`,
  );

  // 3. Idempotenter Insert (UNIQUE auf provider_message_id). Attachment-
  // Inhalte bleiben ausschliesslich im raw_payload-JSONB.
  let insertedId: string | null = null;
  try {
    const inserted = await db
      .insert(processMails)
      .values({
        direction: "inbound",
        providerMessageId: mail.messageId,
        fromAddress: mail.fromAddress,
        toAddress: mail.toAddress,
        subject: mail.subject,
        bodyText: mail.bodyText,
        bodyHtml: mail.bodyHtml,
        headers: mail.headers,
        rawPayload: rawBody as Record<string, unknown>,
        receivedAt: new Date(),
      })
      .onConflictDoNothing({ target: processMails.providerMessageId })
      .returning({ id: processMails.id });
    insertedId = inserted[0]?.id ?? null;
  } catch (error) {
    // Insert selbst gescheitert (z.B. DB nicht erreichbar) -> 500, damit
    // Postmark erneut zustellt (transienter Fehler).
    console.error("[postmark-inbound] db insert failed", error);
    return new Response("Internal Server Error", { status: 500 });
  }

  // 4. Job nur bei neuer Zeile enqueuen (Duplikat -> kein Re-Processing).
  if (insertedId) {
    try {
      await enqueue(PROCESS_INBOUND_MAIL_QUEUE, { processMailId: insertedId });
    } catch (error) {
      // Nach erfolgreichem Insert: intern loggen, trotzdem 200 (die Mail ist
      // sicher gespeichert; ein erneuter Enqueue kann nachgeholt werden).
      console.error("[postmark-inbound] enqueue failed (mail stored)", error);
    }
  }

  // 5. Immer 200 ab hier (auch bei Duplikat), damit Postmark nicht retryt.
  return new Response(null, { status: 200 });
}
