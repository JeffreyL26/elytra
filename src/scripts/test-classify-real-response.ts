// Manueller Klassifikations-Check gegen die ECHTE Claude-API (laeuft NICHT
// in CI). Schickt die anonymisierte Yasni-Fixture durch classifyInbound und
// loggt Kategorie + Confidence. Erwartung: no_data_held, hohe Confidence.
//
// Aufruf (braucht ANTHROPIC_API_KEY in .env):
//   pnpm tsx --env-file=.env src/scripts/test-classify-real-response.ts

import {
  yasniNoDataHeldBody,
  yasniNoDataHeldFrom,
  yasniNoDataHeldPdfText,
  yasniNoDataHeldSubject,
} from "@/lib/llm/__fixtures__/yasni-no-data-held";
import { classifyInbound } from "@/lib/llm/classify-inbound";

async function main(): Promise<void> {
  const expected = "no_data_held";
  const result = await classifyInbound({
    subject: yasniNoDataHeldSubject,
    textBody: yasniNoDataHeldBody,
    fromAddress: yasniNoDataHeldFrom,
    attachments: [{ name: "auskunft.pdf", text: yasniNoDataHeldPdfText }],
  });

  console.log("Fixture:        yasni-no-data-held");
  console.log(`Modell:         ${result.model} (Prompt ${result.promptVersion})`);
  console.log(`Kategorie:      ${result.category} (erwartet: ${expected})`);
  console.log(`Confidence:     ${result.confidence}`);
  console.log(`Manual Review:  ${result.needsManualReview}`);
  console.log(`Begruendung:    ${result.reasoning}`);

  if (result.category !== expected) {
    console.error(`\nFEHLER: Kategorie weicht von ${expected} ab.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
