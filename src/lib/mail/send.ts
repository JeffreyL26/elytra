import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { env } from "@/lib/env";
import { createId } from "@/lib/ids";

export interface SendMailInput {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  // Wird in den Message-ID-Header eingebettet, damit Stufe-3-Matching
  // (In-Reply-To/References) auch in Production greift.
  processToken: string;
  // Einzige Schaltstelle: stammt aus broker.is_dummy. true => kein SES-Call.
  dummy: boolean;
}

export interface SendMailResult {
  // Eigener Message-ID-Header (inkl. spitzer Klammern). Wird als
  // process_mails.provider_message_id gespeichert -- Quelle fuer Stufe 3.
  messageId: string;
  // SES-API-Response-Message-ID (fuer Bounce-Tracking), null im Dummy-Modus.
  providerResponseId: string | null;
}

// Deterministisch strukturierter Message-ID-Header. Das Token macht spaeteres
// Reply-Matching robust; der createId-Suffix haelt die ID pro Mail eindeutig.
function buildMessageId(processToken: string, fromDomain: string): string {
  return `<proc-${processToken}-${createId().slice(0, 8)}@${fromDomain}>`;
}

// Genau zwei Pfade: dummy oder real. Kein Mischbetrieb, keine Override-Flags.
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  // MAIL_FROM_DOMAIN wird in beiden Pfaden fuer den Message-ID-Header benoetigt.
  const fromDomain = env.MAIL_FROM_DOMAIN;
  if (!fromDomain) {
    throw new Error("MAIL_FROM_DOMAIN missing — required to build Message-ID");
  }
  const messageId = buildMessageId(input.processToken, fromDomain);

  if (input.dummy) {
    console.log(`[DUMMY] would send to ${input.to}: ${input.subject}`);
    return { messageId, providerResponseId: null };
  }
  return sendViaSes(input, messageId);
}

function wrapBase64(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n");
}

// Minimales multipart/alternative-MIME, damit wir den Message-ID-Header selbst
// setzen koennen (SendEmail wuerde ihn ueberschreiben -> SendRawEmail).
function buildRawMime(input: SendMailInput, messageId: string): string {
  const boundary = `b-${createId()}`;
  const subject = `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`;
  const text = wrapBase64(Buffer.from(input.textBody, "utf8").toString("base64"));
  const html = wrapBase64(Buffer.from(input.htmlBody, "utf8").toString("base64"));
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Reply-To: ${input.replyTo}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function sendViaSes(input: SendMailInput, messageId: string): Promise<SendMailResult> {
  // Credential-Check ausschliesslich im real-Pfad (Point-of-Use).
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("SES credentials missing — set AWS_ACCESS_KEY_ID/SECRET in .env");
  }
  if (!AWS_REGION) {
    throw new Error("SES region missing — set AWS_REGION in .env");
  }

  const client = new SESClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  const command = new SendRawEmailCommand({
    Source: input.from,
    Destinations: [input.to],
    RawMessage: { Data: Buffer.from(buildRawMime(input, messageId), "utf8") },
  });

  const response = await client.send(command);
  return { messageId, providerResponseId: response.MessageId ?? null };
}
