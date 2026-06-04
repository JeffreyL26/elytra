import * as postmark from "postmark";
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
  // Einzige Schaltstelle: stammt aus broker.is_dummy. true => kein API-Call.
  dummy: boolean;
}

export interface SendMailResult {
  // Eigener Message-ID-Header (inkl. spitzer Klammern). Wird als
  // process_mails.provider_message_id gespeichert -- Quelle fuer Stufe 3.
  messageId: string;
  // Postmark-API-Response-MessageID (fuer Bounce-Tracking), null im Dummy-Modus.
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
  return sendViaPostmark(input, messageId);
}

async function sendViaPostmark(input: SendMailInput, messageId: string): Promise<SendMailResult> {
  // Credential-Check ausschliesslich im real-Pfad (Point-of-Use).
  const token = env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    throw new Error("POSTMARK_SERVER_TOKEN missing — set it in .env");
  }

  const client = new postmark.ServerClient(token);
  // Custom Message-ID via Headers -- Postmark akzeptiert sie und liefert sie
  // unveraendert aus, damit der Broker sie in In-Reply-To reflektiert.
  const response = await client.sendEmail({
    From: input.from,
    To: input.to,
    ReplyTo: input.replyTo,
    Subject: input.subject,
    TextBody: input.textBody,
    HtmlBody: input.htmlBody,
    Headers: [{ Name: "Message-ID", Value: messageId }],
  });

  return { messageId, providerResponseId: response.MessageID ?? null };
}
