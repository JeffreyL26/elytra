import { z } from "zod";

// Postmark-Inbound-Attachment: Content ist Base64-codiert. Der Content wird
// NICHT in eine eigene Struktur/Tabelle kopiert -- er bleibt ausschliesslich
// im raw_payload-JSONB erhalten (bewusste Entscheidung, Volumen rechtfertigt
// kein eigenes Attachment-Storage). Die normalisierte Struktur fuehrt nur
// Metadaten.
export const postmarkAttachmentSchema = z
  .object({
    Name: z.string(),
    ContentType: z.string(),
    ContentLength: z.number(),
    Content: z.string(),
  })
  .passthrough();

// Postmark Inbound-Payload: strikt auf den Feldern, die wir brauchen,
// passthrough fuer alles andere (Doku: postmarkapp.com/developer/webhooks).
export const postmarkInboundSchema = z
  .object({
    MessageID: z.string().min(1),
    From: z.string(),
    To: z.string(),
    ToFull: z.array(z.object({ Email: z.string() }).passthrough()),
    Subject: z.string(),
    TextBody: z.string(),
    HtmlBody: z.string(),
    Headers: z.array(z.object({ Name: z.string(), Value: z.string() })),
    Date: z.string(),
    Attachments: z.array(postmarkAttachmentSchema).optional(),
  })
  .passthrough();

export type PostmarkInboundPayload = z.infer<typeof postmarkInboundSchema>;

export interface InboundAttachmentMeta {
  name: string;
  contentType: string;
  contentLength: number;
}

export interface ParsedInboundMail {
  messageId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  headers: Record<string, string>;
  attachments: InboundAttachmentMeta[];
}

// Normalisiert ein rohes Postmark-Inbound-Payload. null = Schema-Verletzung
// (Aufrufer entscheidet ueber die HTTP-Antwort).
export function parseInbound(rawBody: unknown): ParsedInboundMail | null {
  const parsed = postmarkInboundSchema.safeParse(rawBody);
  if (!parsed.success) {
    return null;
  }
  const payload = parsed.data;

  const headers: Record<string, string> = {};
  for (const header of payload.Headers) {
    headers[header.Name] = header.Value;
  }

  return {
    messageId: payload.MessageID,
    fromAddress: payload.From,
    toAddress: payload.To,
    subject: payload.Subject,
    bodyText: payload.TextBody,
    bodyHtml: payload.HtmlBody,
    headers,
    attachments: (payload.Attachments ?? []).map((attachment) => ({
      name: attachment.Name,
      contentType: attachment.ContentType,
      contentLength: attachment.ContentLength,
    })),
  };
}
