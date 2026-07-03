import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { postmarkAttachmentSchema } from "@/lib/mail/parse-inbound";

// Token-Schutz: extrahierter Text pro Anhang wird gekappt, damit ein grosses
// PDF den Klassifikations-Prompt nicht sprengt.
export const MAX_ATTACHMENT_TEXT_CHARS = 15_000;

export interface AttachmentText {
  name: string;
  // null = Inhalt nicht verfuegbar (kein PDF, kein Textlayer, Parse-Fehler).
  // Kein OCR -- solche Faelle sollen ueber niedrige LLM-Confidence in
  // manual_review laufen.
  text: string | null;
  note?: string;
}

const attachmentsPayloadSchema = z
  .object({ Attachments: z.array(postmarkAttachmentSchema) })
  .passthrough();

type PostmarkAttachment = z.infer<typeof postmarkAttachmentSchema>;

async function extractOne(attachment: PostmarkAttachment): Promise<AttachmentText> {
  // ContentType kann Parameter tragen ("application/pdf; name=..."), daher
  // nur den Medientyp vergleichen.
  const mediaType = attachment.ContentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/pdf") {
    return {
      name: attachment.Name,
      text: null,
      note: `nicht extrahierbar (${attachment.ContentType})`,
    };
  }

  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: Buffer.from(attachment.Content, "base64") });
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) {
      // PDF ohne Textlayer (z. B. Scan) -- bewusst kein OCR.
      return { name: attachment.Name, text: null, note: "Extraktion fehlgeschlagen" };
    }
    if (text.length > MAX_ATTACHMENT_TEXT_CHARS) {
      return {
        name: attachment.Name,
        text: text.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
        note: `gekuerzt auf ${MAX_ATTACHMENT_TEXT_CHARS} Zeichen`,
      };
    }
    return { name: attachment.Name, text };
  } catch {
    return { name: attachment.Name, text: null, note: "Extraktion fehlgeschlagen" };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}

// Extrahiert Text aus den Anhaengen eines gespeicherten Postmark-Payloads
// (process_mails.raw_payload). Tolerant: fehlendes oder ungueltiges
// Attachments-Feld -> leeres Array. Wirft nie.
export async function extractAttachmentTexts(
  rawPayload: Record<string, unknown> | null | undefined,
): Promise<AttachmentText[]> {
  const parsed = attachmentsPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return [];
  }

  const results: AttachmentText[] = [];
  for (const attachment of parsed.data.Attachments) {
    results.push(await extractOne(attachment));
  }
  return results;
}
