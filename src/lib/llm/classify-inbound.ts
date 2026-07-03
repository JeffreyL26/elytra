import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import type { AttachmentText } from "@/lib/mail/extract-attachment-text";

export const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";
// Bei Prompt-/Tool-Aenderungen hochzaehlen -- wird mit jeder Klassifikation
// geloggt, damit Ergebnisse spaeter zur Prompt-Version zuordenbar bleiben.
export const CLASSIFY_PROMPT_VERSION = "2026-07-04";
export const CONFIDENCE_THRESHOLD = 0.7;

export const INBOUND_CATEGORIES = [
  "success",
  "no_data_held",
  "blacklisted",
  "in_progress",
  "rejected",
  "unrelated",
] as const;

export type InboundCategory = (typeof INBOUND_CATEGORIES)[number];

export interface ClassifyInput {
  subject: string | null;
  textBody: string | null;
  fromAddress: string;
  // Extrahierte Anhang-Texte (extractAttachmentTexts). Die Substanz einer
  // Antwort kann vollstaendig im Anhang stecken (realer Fall: Yasni, PDF).
  attachments?: AttachmentText[];
}

export interface Classification {
  category: InboundCategory;
  confidence: number;
  reasoning: string;
  model: string;
  promptVersion: string;
  // confidence < CONFIDENCE_THRESHOLD -> Prozess soll in manual_review.
  needsManualReview: boolean;
}

const SYSTEM_PROMPT = `Du bist ein Klassifikator fuer eingehende E-Mail-Antworten von Data-Brokern auf DSGVO-Loeschanfragen (Art. 17/21/15 DSGVO), die im Namen betroffener Personen gestellt wurden. Ordne jede Antwort genau einer Kategorie zu und nutze dafuer ausschliesslich das Tool "classify_email".

Kategorien:
- success: Der Broker bestaetigt die Loeschung bzw. Entfernung der personenbezogenen Daten (z. B. "Ihre Daten wurden vollstaendig geloescht"). NUR wenn eine Loeschung/Entfernung bestaetigt wird.
- no_data_held: Der Broker bestaetigt, dass keine bzw. keine relevanten personenbezogenen Daten zur betroffenen Person vorliegen; die Anfrage ist damit vollstaendig beantwortet (z. B. "Zu dieser Person liegen keine Daten/Suchergebnisse vor").
- blacklisted: Der Broker bestaetigt die Aufnahme in eine Sperr-/Suppression-Liste (z. B. "Sie wurden in unsere Sperrliste aufgenommen").
- in_progress: Die Anfrage wurde erhalten und ist in Bearbeitung, oder es werden weitere Angaben/ein Identitaetsnachweis verlangt (z. B. "Wir bearbeiten Ihre Anfrage", "Bitte weisen Sie Ihre Identitaet nach").
- rejected: Die Loeschung wird abgelehnt oder bestritten (z. B. "Wir lehnen die Loeschung ab", Berufung auf gesetzliche Aufbewahrungspflichten zur Verweigerung).
- unrelated: Auto-Reply (Abwesenheit, reine Eingangsbestaetigung ohne Bezug), Spam, themenfremd oder inhaltlich nicht zuordenbar.

Abgrenzung:
- success vs. no_data_held: success NUR, wenn eine Loeschung/Entfernung bestaetigt wird. "Wir haben nichts gefunden" ist no_data_held -- auch dann, wenn der Broker zusaetzlich verbleibende Rest-Daten (z. B. IP-Adressen, Daten dieser Korrespondenz) erwaehnt.
- rejected vs. no_data_held: rejected nur bei inhaltlicher Weigerung. Die Aussage, es laegen keine Daten vor, ist keine Ablehnung.

Anhaenge: Die Substanz einer Antwort kann vollstaendig in einem Anhang stecken (Bloecke [Anhang N: ...] nach dem E-Mail-Body). Ist ein Anhang als nicht extrahierbar markiert, fehlt dir moeglicherweise der wesentliche Inhalt -- setze die Confidence dann entsprechend niedriger.

Beispiel fuer no_data_held (reale, anonymisierte Broker-Antwort; Substanz im PDF-Anhang):
[E-Mail-Body] "Sehr geehrte Damen und Herren, anbei erhalten Sie unsere Antwort auf Ihr Ersuchen als PDF-Dokument."
[Anhang 1: auskunft.pdf] "... zu der von Ihnen vertretenen Person (Max Mustermann) liegen in unserem Dienst keine Suchergebnisse und kein Expose vor. Verarbeitet wurden lediglich Name, IP-Adresse sowie die Daten dieser Korrespondenz. ..."
-> no_data_held, hohe Confidence (die erwaehnten Rest-Daten aendern daran nichts).

confidence ist deine Sicherheit von 0 bis 1; bei Mehrdeutigkeit niedrig ansetzen. reasoning ist eine kurze Begruendung auf Deutsch.`;

const CLASSIFY_TOOL = {
  name: "classify_email",
  description: "Klassifiziert die Antwort eines Data-Brokers auf eine DSGVO-Loeschanfrage.",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: [...INBOUND_CATEGORIES],
        description: "Genau eine der definierten Kategorien.",
      },
      confidence: {
        type: "number",
        description: "Sicherheit der Einstufung, 0 bis 1.",
      },
      reasoning: {
        type: "string",
        description: "Kurze Begruendung auf Deutsch.",
      },
    },
    required: ["category", "confidence", "reasoning"],
  },
} satisfies Anthropic.Tool;

const toolInputSchema = z.object({
  category: z.enum(INBOUND_CATEGORIES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// Baut den User-Content: Body und Anhang-Texte klar markiert. Nicht
// extrahierbare Anhaenge werden mit Name + Grund aufgefuehrt, damit das
// Modell weiss, dass Inhalt fehlt (-> tendenziell niedrigere Confidence).
export function buildUserContent(input: ClassifyInput): string {
  const parts = [
    `Betreff: ${input.subject ?? "(kein Betreff)"}`,
    `Von: ${input.fromAddress}`,
    "",
    "[E-Mail-Body]",
    input.textBody ?? "(kein Text)",
  ];
  (input.attachments ?? []).forEach((attachment, index) => {
    const label = attachment.note
      ? `[Anhang ${index + 1}: ${attachment.name} — ${attachment.note}]`
      : `[Anhang ${index + 1}: ${attachment.name}]`;
    parts.push("", label);
    if (attachment.text !== null) {
      parts.push(attachment.text);
    }
  });
  return parts.join("\n");
}

export async function classifyInbound(input: ClassifyInput): Promise<Classification> {
  // Point-of-Use-Check: ohne Key keine Klassifikation.
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing — required for inbound classification");
  }

  const client = new Anthropic({ apiKey });
  const userContent = buildUserContent(input);

  const response = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: CLASSIFY_TOOL.name },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("classification returned no tool_use block");
  }

  const parsed = toolInputSchema.parse(toolUse.input);
  return {
    category: parsed.category,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    model: CLASSIFY_MODEL,
    promptVersion: CLASSIFY_PROMPT_VERSION,
    needsManualReview: parsed.confidence < CONFIDENCE_THRESHOLD,
  };
}
