import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  brokers,
  customerProfiles,
  optOutProcesses,
  processEvents,
  processMails,
} from "@/db/schema";
import { env } from "@/lib/env";
import { buildBrokerEnvelope } from "@/lib/mail/broker-from";
import { sendMail } from "@/lib/mail/send";
import {
  buildOptOutRequest,
  formatProfileName,
  toTemplateLocale,
} from "@/lib/mail/templates/opt-out-request";

export const SEND_OPT_OUT_MAIL_QUEUE = "send-opt-out-mail";

export interface SendOptOutMailPayload {
  processId: string;
}

// Laedt Prozess + Broker + Profil, baut die Mail, sendet sie (Dummy-Modus
// respektiert broker.is_dummy) und persistiert process_mails, ein mail_sent-
// Event und den Status 'contacted' -- alles in einer Transaktion.
export async function sendOptOutMail(processId: string): Promise<void> {
  const [proc] = await db.select().from(optOutProcesses).where(eq(optOutProcesses.id, processId));
  if (!proc) {
    throw new Error(`opt_out_process ${processId} not found`);
  }

  const [broker] = await db.select().from(brokers).where(eq(brokers.id, proc.brokerId));
  if (!broker) {
    throw new Error(`broker ${proc.brokerId} not found`);
  }
  if (!broker.optOutEmail) {
    throw new Error(`broker ${broker.slug} has no opt_out_email`);
  }
  const toAddress = broker.optOutEmail;

  const [profile] = await db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, proc.userId));
  if (!profile) {
    throw new Error(`customer_profile for user ${proc.userId} not found`);
  }

  // From-Adresse und Reply-To ausschliesslich aus env (kein Hardcoding).
  // Self-Requests kommen von der Privatadresse (SELF_EMAIL), Vertretungs-
  // Anfragen vom Service (MAIL_FROM_ADDRESS). Fail-fast dafuer liegt im
  // Worker-Preflight; dieser Check ist das Point-of-Use-Sicherheitsnetz.
  const selfModeFrom = proc.isSelfRequest ? env.SELF_EMAIL : env.MAIL_FROM_ADDRESS;
  const replyDomain = env.REPLY_DOMAIN;
  if (!selfModeFrom || !replyDomain) {
    const fromVar = proc.isSelfRequest ? "SELF_EMAIL" : "MAIL_FROM_ADDRESS";
    throw new Error(`${fromVar}/REPLY_DOMAIN missing — set them in .env`);
  }

  // Welche Adresse als From geht, entscheidet der Modus (broker-from.ts).
  // Dieselbe Funktion nutzt der Dry-Run in trigger-real-send.ts -- was dort
  // angezeigt wird, ist damit exakt das, was hier versendet wird.
  // isSelfRequest steuert Template UND Absender aus derselben Quelle -- ein
  // Ich-Form-Text darf nicht sichtbar unter der Marke abgesendet werden.
  const envelope = buildBrokerEnvelope({
    mode: env.MAIL_BROKER_FROM_MODE,
    processToken: proc.processToken,
    replyDomain,
    selfModeFrom,
    isSelfRequest: proc.isSelfRequest,
    // Der Name kommt aus DEMSELBEN Profil, das auch das Template rendert --
    // NICHT aus env.SELF_NAME. Zwei Quellen fielen auseinander, sobald das
    // Profil ueber /profil geaendert wird, ohne die Env nachzuziehen.
    selfDisplayName: formatProfileName(profile),
  });

  const mail = buildOptOutRequest(
    profile,
    broker,
    proc.processToken,
    toTemplateLocale(broker.language, { brokerSlug: broker.slug }),
    proc.isSelfRequest,
  );

  const { messageId, providerResponseId } = await sendMail({
    from: envelope.fromHeader,
    to: toAddress,
    replyTo: envelope.replyTo,
    subject: mail.subject,
    textBody: mail.textBody,
    htmlBody: mail.htmlBody,
    processToken: proc.processToken,
    dummy: broker.isDummy,
  });

  await db.transaction(async (tx) => {
    await tx.insert(processMails).values({
      processId,
      direction: "outbound",
      providerMessageId: messageId,
      // Reine Adresse ohne Display-Name -- die Spalte haelt Adressen, nicht
      // Header-Werte.
      fromAddress: envelope.fromAddress,
      toAddress,
      subject: mail.subject,
      bodyText: mail.textBody,
      bodyHtml: mail.htmlBody,
      // Postmark-API-MessageID fuer Bounce-Tracking in headers ablegen;
      // null im Dummy. Schluessel fuers Reply-Matching ist provider_message_id
      // (unser eigener Header), NICHT die Postmark-API-ID.
      headers: providerResponseId ? { "X-Postmark-MessageId": providerResponseId } : null,
      sentAt: new Date(),
    });
    await tx.insert(processEvents).values({
      processId,
      eventType: "mail_sent",
      payload: {
        providerMessageId: messageId,
        to: toAddress,
        dummy: broker.isDummy,
        subject: mail.subject,
        // Audit: aus welcher Adresse ging die Anfrage raus? Macht bei einer
        // spaeteren Rueckkanal-Analyse nachvollziehbar, ob ein Vorgang noch im
        // self-Modus (Antworten laufen ins private Postfach) versendet wurde.
        fromMode: envelope.mode,
        from: envelope.fromAddress,
      },
    });
    await tx
      .update(optOutProcesses)
      .set({
        status: "contacted",
        lastContactedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(optOutProcesses.id, processId));
  });
}

// Bei finalem Scheitern (nach Ausschoepfen der pg-boss-Retries): Fehler-Event
// schreiben und Prozess auf 'failed' setzen.
export async function markSendFailed(processId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.transaction(async (tx) => {
    await tx.insert(processEvents).values({
      processId,
      eventType: "error",
      payload: { stage: SEND_OPT_OUT_MAIL_QUEUE, message },
    });
    await tx
      .update(optOutProcesses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(optOutProcesses.id, processId));
  });
}
