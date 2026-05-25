import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";

export const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";
// Bei Prompt-/Tool-Aenderungen hochzaehlen -- wird mit jeder Klassifikation
// geloggt, damit Ergebnisse spaeter zur Prompt-Version zuordenbar bleiben.
export const CLASSIFY_PROMPT_VERSION = "2026-05-25";
export const CONFIDENCE_THRESHOLD = 0.7;

export const INBOUND_CATEGORIES = [
  "success",
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
- success: Der Broker bestaetigt die Loeschung der personenbezogenen Daten (z. B. "Ihre Daten wurden vollstaendig geloescht").
- blacklisted: Der Broker bestaetigt die Aufnahme in eine Sperr-/Suppression-Liste oder teilt mit, dass keine Daten (mehr) vorliegen (z. B. "Sie wurden in unsere Sperrliste aufgenommen", "Zu dieser Person liegen keine Daten vor").
- in_progress: Die Anfrage wurde erhalten und ist in Bearbeitung, oder es werden weitere Angaben/ein Identitaetsnachweis verlangt (z. B. "Wir bearbeiten Ihre Anfrage", "Bitte weisen Sie Ihre Identitaet nach").
- rejected: Die Loeschung wird abgelehnt oder bestritten (z. B. "Wir lehnen die Loeschung ab", Berufung auf gesetzliche Aufbewahrungspflichten zur Verweigerung).
- unrelated: Auto-Reply (Abwesenheit, reine Eingangsbestaetigung ohne Bezug), Spam, themenfremd oder inhaltlich nicht zuordenbar.

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

export async function classifyInbound(input: ClassifyInput): Promise<Classification> {
  // Point-of-Use-Check: ohne Key keine Klassifikation.
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing — required for inbound classification");
  }

  const client = new Anthropic({ apiKey });
  const userContent = `Betreff: ${input.subject ?? "(kein Betreff)"}
Von: ${input.fromAddress}

${input.textBody ?? "(kein Text)"}`;

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
