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
import { sendMail } from "@/lib/mail/send";
import { buildOptOutRequest } from "@/lib/mail/templates/opt-out-request";

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
  const from = env.MAIL_FROM_ADDRESS;
  const replyDomain = env.REPLY_DOMAIN;
  if (!from || !replyDomain) {
    throw new Error("MAIL_FROM_ADDRESS/REPLY_DOMAIN missing — set them in .env");
  }
  const replyTo = `proc-${proc.processToken}@${replyDomain}`;

  const mail = buildOptOutRequest(profile, broker, proc.processToken, "de");

  const { messageId } = await sendMail({
    from,
    to: toAddress,
    replyTo,
    subject: mail.subject,
    textBody: mail.textBody,
    htmlBody: mail.htmlBody,
    dummy: broker.isDummy,
  });

  await db.transaction(async (tx) => {
    await tx.insert(processMails).values({
      processId,
      direction: "outbound",
      providerMessageId: messageId,
      fromAddress: from,
      toAddress,
      subject: mail.subject,
      bodyText: mail.textBody,
      bodyHtml: mail.htmlBody,
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
