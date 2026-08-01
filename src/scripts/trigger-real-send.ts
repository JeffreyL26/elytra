// Trigger fuer den ersten realen Self-Request-Versand (Phase 3b.5).
//
//   Dry-Run (Default, KEINE DB-Schreibvorgaenge, kein Postmark-Call):
//     pnpm tsx --env-file=.env src/scripts/trigger-real-send.ts --broker <slug>
//
//   Echter Versand (interaktive "JA"-Bestaetigung):
//     pnpm tsx --env-file=.env src/scripts/trigger-real-send.ts --broker <slug> --send
//
// Der Versand laeuft ueber sendOptOutMail() -- derselbe Code-Pfad wie der
// Worker (Template, Message-ID, process_mails, Events, Status). broker.is_dummy
// wird dort bedingungslos respektiert.

import { createInterface } from "node:readline/promises";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { brokers, customerProfiles, optOutProcesses, users } from "@/db/schema";
import { env } from "@/lib/env";
import { createProcessToken } from "@/lib/ids";
import { buildBrokerEnvelope } from "@/lib/mail/broker-from";
import {
  buildOptOutRequest,
  formatProfileName,
  TEMPLATE_LOCALES,
  toTemplateLocale,
} from "@/lib/mail/templates/opt-out-request";
import { sendOptOutMail } from "@/worker/jobs/send-opt-out-mail";

interface CliArgs {
  brokerSlug: string;
  send: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const send = argv.includes("--send");
  const brokerIndex = argv.indexOf("--broker");
  const brokerSlug = brokerIndex !== -1 ? argv[brokerIndex + 1] : undefined;
  if (!brokerSlug || brokerSlug.startsWith("--")) {
    console.error(
      "Usage: pnpm tsx --env-file=.env src/scripts/trigger-real-send.ts --broker <slug> [--send]",
    );
    process.exit(1);
  }
  return { brokerSlug, send };
}

// Preflight (FEST VEREINBART -- send.ts allein ist Fail-Late): im --send-Modus
// sind alle Werte hart; im Dry-Run brechen nur die fuers Rendering noetigen
// Werte ab, der Rest wird als FEHLT ausgewiesen.
function preflight(send: boolean): void {
  const checks: Array<[name: string, value: string | undefined, neededForDryRun: boolean]> = [
    ["POSTMARK_SERVER_TOKEN", env.POSTMARK_SERVER_TOKEN, false],
    ["ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY, false],
    ["MAIL_FROM_ADDRESS", env.MAIL_FROM_ADDRESS, false],
    ["MAIL_FROM_DOMAIN", env.MAIL_FROM_DOMAIN, false],
    ["REPLY_DOMAIN", env.REPLY_DOMAIN, true],
    ["SELF_EMAIL", env.SELF_EMAIL, true],
  ];

  console.log("Preflight:");
  const missing: string[] = [];
  for (const [name, value, neededForDryRun] of checks) {
    const ok = Boolean(value);
    console.log(`  ${ok ? "OK    " : "FEHLT "} ${name}`);
    if (!ok && (send || neededForDryRun)) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.error(`\nABBRUCH: ${missing.join(", ")} fehlt — in .env setzen.`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  preflight(args.send);

  // SELF_EMAIL ist nach preflight() garantiert gesetzt.
  const selfEmail = env.SELF_EMAIL;
  if (!selfEmail || !env.REPLY_DOMAIN) {
    throw new Error("unreachable: preflight already verified SELF_EMAIL/REPLY_DOMAIN");
  }

  const [user] = await db.select().from(users).where(eq(users.email, selfEmail)).limit(1);
  if (!user) {
    console.error(`ABBRUCH: kein User zu SELF_EMAIL gefunden — zuerst 'pnpm db:seed:self' laufen.`);
    process.exit(1);
  }
  const [profile] = await db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, user.id))
    .limit(1);
  if (!profile) {
    console.error("ABBRUCH: customer_profile fehlt — zuerst 'pnpm db:seed:self' laufen.");
    process.exit(1);
  }

  const [broker] = await db
    .select()
    .from(brokers)
    .where(eq(brokers.slug, args.brokerSlug))
    .limit(1);
  if (!broker) {
    console.error(`ABBRUCH: Broker '${args.brokerSlug}' nicht gefunden.`);
    process.exit(1);
  }
  if (!broker.optOutEmail) {
    console.error(`ABBRUCH: Broker '${broker.slug}' hat keine opt_out_email.`);
    process.exit(1);
  }

  // Bestehenden (self, broker)-Prozess wiederverwenden, nie doppelt anlegen.
  const [existing] = await db
    .select()
    .from(optOutProcesses)
    .where(and(eq(optOutProcesses.userId, user.id), eq(optOutProcesses.brokerId, broker.id)))
    .limit(1);

  // Sicherung: ein bestehender Nicht-Self-Prozess wuerde das Vertretungs-
  // Template rendern — hier geht es ausschliesslich um Self-Sends.
  if (existing && !existing.isSelfRequest) {
    console.error(
      `ABBRUCH: Prozess ${existing.id} existiert, ist aber KEIN Self-Request (is_self_request=false). Manuell klaeren.`,
    );
    process.exit(1);
  }

  console.log(`\nBroker:  ${broker.name} (${broker.slug}, language=${broker.language})`);
  console.log(`Dummy:   ${broker.isDummy} | aktiv: ${broker.isActive}`);

  // Sichtbare Warnung, BEVOR gerendert/gesendet wird: ein Broker mit fr/es
  // bekaeme den EN-Text -- das soll niemand versehentlich ausloesen.
  if (!(TEMPLATE_LOCALES as readonly string[]).includes(broker.language)) {
    console.warn(
      `\n*** WARNUNG: Broker '${broker.slug}' hat Sprache '${broker.language}', wofuer KEIN reviewtes Template existiert — die Mail wuerde auf ENGLISCH rausgehen (EN-Fallback). ***`,
    );
  }
  console.log(
    existing
      ? `Prozess: existiert (id=${existing.id}, status=${existing.status}) — wird wiederverwendet`
      : "Prozess: existiert noch nicht — wird beim Versand angelegt",
  );

  if (!args.send) {
    // Dry-Run: ephemeres Token, nichts wird geschrieben.
    const token = existing?.processToken ?? createProcessToken();
    const tokenNote = existing ? "(aus bestehendem Prozess)" : "(ephemer, nicht persistiert)";
    const mail = buildOptOutRequest(
      profile,
      broker,
      token,
      toTemplateLocale(broker.language, { brokerSlug: broker.slug }),
      true,
    );

    // Envelope ueber dieselbe Funktion wie der Versand-Job -- was hier steht,
    // geht auch genau so raus.
    const envelope = buildBrokerEnvelope({
      mode: env.MAIL_BROKER_FROM_MODE,
      processToken: token,
      replyDomain: env.REPLY_DOMAIN ?? "(REPLY_DOMAIN fehlt!)",
      selfModeFrom: selfEmail,
      // Dieses Script versendet ausschliesslich Self-Requests (siehe Guard oben).
      isSelfRequest: true,
      // Aus dem Profil, exakt wie im Versand-Job -- nicht aus env.SELF_NAME.
      selfDisplayName: formatProfileName(profile),
    });

    console.log("\n===== DRY-RUN (kein Versand, keine DB-Schreibvorgaenge) =====");
    console.log(
      `From-Modus: ${envelope.mode}${envelope.mode === "self" ? "  (Antworten gehen an SELF_EMAIL — NICHT in die Pipeline!)" : "  (Token in der From-Adresse — Antworten landen in der Pipeline)"}`,
    );
    console.log(`From:     ${envelope.fromHeader}`);
    console.log(`To:       ${broker.optOutEmail}`);
    console.log(
      `Reply-To: ${envelope.replyTo ?? "(nicht gesetzt — Token steckt in der From-Adresse)"}  ${tokenNote}`,
    );
    console.log(`Subject:  ${mail.subject}`);
    console.log("----- Body (Text) -----");
    console.log(mail.textBody);
    console.log("===== ENDE DRY-RUN =====");
    console.log("\nEchter Versand: gleiche Argumente plus --send");
    return;
  }

  // --send: interaktive Bestaetigung mit woertlichem "JA". Der effektive
  // Absender MUSS hier stehen -- er entscheidet, ob Antworten die Pipeline
  // erreichen, und im tokenized-Modus ist er nicht SELF_EMAIL.
  console.log(`\nECHTER VERSAND an: ${broker.optOutEmail}`);
  console.log(`From-Modus:        ${env.MAIL_BROKER_FROM_MODE}`);
  if (env.MAIL_BROKER_FROM_MODE === "tokenized") {
    // Bei einem neuen Prozess entsteht das Token erst im Versand -- dann die
    // Form zeigen, nicht die konkrete Adresse erfinden.
    const shown = buildBrokerEnvelope({
      mode: "tokenized",
      // Bei einem neuen Prozess entsteht das Token erst im Versand -- dann die
      // Form zeigen, nicht die konkrete Adresse erfinden.
      processToken: existing?.processToken ?? "<neues Token>",
      replyDomain: env.REPLY_DOMAIN,
      selfModeFrom: selfEmail,
      isSelfRequest: true,
      // Aus dem Profil, exakt wie im Versand-Job -- nicht aus env.SELF_NAME.
      selfDisplayName: formatProfileName(profile),
    }).fromHeader;
    console.log(`Absender (From):   ${shown}`);
    console.log("                   -> Antworten laufen in die Pipeline.");
  } else {
    console.log(`Absender (From):   ${selfEmail}`);
    console.log(
      "                   -> ACHTUNG: Broker antworten an diese Adresse; Antworten erreichen die Pipeline NICHT.",
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Tippe woertlich "JA" um zu senden: ');
  rl.close();
  if (answer.trim() !== "JA") {
    console.log("Abgebrochen — es wurde nichts versendet.");
    return;
  }

  let processId: string;
  if (existing) {
    processId = existing.id;
  } else {
    const [created] = await db
      .insert(optOutProcesses)
      .values({ userId: user.id, brokerId: broker.id, isSelfRequest: true })
      .returning();
    processId = created.id;
    console.log(`Prozess angelegt: ${processId}`);
  }

  await sendOptOutMail(processId);

  const [proc] = await db
    .select()
    .from(optOutProcesses)
    .where(eq(optOutProcesses.id, processId))
    .limit(1);
  console.log(`\nVersand ausgefuehrt. Prozess ${processId}: status=${proc?.status}`);
  console.log("Antworten laufen ueber den Inbound-Webhook + Worker ein (pnpm worker).");
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("trigger-real-send fehlgeschlagen:", error);
    await sql.end();
    process.exit(1);
  });
