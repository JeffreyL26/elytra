import type { Job, JobWithMetadata } from "pg-boss";
import { sql } from "@/db/client";
import {
  type ProcessInboundMailPayload,
  processInboundMail,
} from "@/worker/jobs/process-inbound-mail";
import {
  markSendFailed,
  SEND_OPT_OUT_MAIL_QUEUE,
  type SendOptOutMailPayload,
  sendOptOutMail,
} from "@/worker/jobs/send-opt-out-mail";
import { assertWorkerEnv } from "@/worker/preflight";
import { PROCESS_INBOUND_MAIL_QUEUE } from "@/worker/producer";
import { boss, HELLO_WORLD_QUEUE } from "@/worker/queue";

type HelloWorldPayload = { message: string };

async function handleHelloWorld(jobs: Job<HelloWorldPayload>[]): Promise<void> {
  for (const job of jobs) {
    console.log(`[${HELLO_WORLD_QUEUE}] job ${job.id}:`, job.data);
  }
}

async function handleSendOptOutMail(jobs: JobWithMetadata<SendOptOutMailPayload>[]): Promise<void> {
  for (const job of jobs) {
    try {
      await sendOptOutMail(job.data.processId);
    } catch (error) {
      // Nur beim finalen Versuch den Prozess als failed markieren; davor
      // greift pg-boss-Retry (Exponential Backoff).
      if (job.retryCount >= job.retryLimit) {
        await markSendFailed(job.data.processId, error);
      }
      throw error;
    }
  }
}

async function handleProcessInboundMail(jobs: Job<ProcessInboundMailPayload>[]): Promise<void> {
  for (const job of jobs) {
    const result = await processInboundMail(job.data.processMailId);
    console.log(
      `[${PROCESS_INBOUND_MAIL_QUEUE}] MessageID=${result.messageId ?? "-"} matchStage=${result.matchStage} category=${result.category ?? "-"} confidence=${result.confidence ?? "-"}`,
    );
  }
}

async function main(): Promise<void> {
  // Fail-Fast: kritische Env-Werte pruefen, BEVOR pg-boss Jobs konsumiert.
  assertWorkerEnv();

  // Vor start() registrieren, damit auch Start-/Laufzeitfehler sichtbar sind.
  boss.on("error", (error) => console.error("[pg-boss] error:", error));
  boss.on("warning", (warning) => console.warn("[pg-boss] warning:", warning));

  await boss.start();

  await boss.createQueue(HELLO_WORLD_QUEUE);
  await boss.work(HELLO_WORLD_QUEUE, handleHelloWorld);

  // retryLimit 2 => 3 Versuche insgesamt (1 + 2 Retries), Exponential Backoff.
  await boss.createQueue(SEND_OPT_OUT_MAIL_QUEUE, {
    retryLimit: 2,
    retryBackoff: true,
  });
  await boss.work<SendOptOutMailPayload>(
    SEND_OPT_OUT_MAIL_QUEUE,
    { includeMetadata: true },
    handleSendOptOutMail,
  );

  // Inbound-Verarbeitung: LLM-Fehler werden im Job abgefangen; DB-Transient-
  // Fehler werfen und werden via Retry erneut versucht.
  await boss.createQueue(PROCESS_INBOUND_MAIL_QUEUE, {
    retryLimit: 2,
    retryBackoff: true,
  });
  await boss.work<ProcessInboundMailPayload>(PROCESS_INBOUND_MAIL_QUEUE, handleProcessInboundMail);

  console.log("Worker ready");
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} empfangen, fahre Worker herunter ...`);
  await boss.stop();
  await sql.end();
  console.log("Worker gestoppt, Verbindungen geschlossen.");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch(async (error) => {
  console.error("Worker-Start fehlgeschlagen:", error);
  await boss.stop().catch(() => {});
  await sql.end().catch(() => {});
  process.exit(1);
});
