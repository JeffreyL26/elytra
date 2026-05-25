import type { Job } from "pg-boss";
import { sql } from "@/db/client";
import { boss, HELLO_WORLD_QUEUE } from "@/worker/queue";

type HelloWorldPayload = { message: string };

async function handleHelloWorld(jobs: Job<HelloWorldPayload>[]): Promise<void> {
  for (const job of jobs) {
    console.log(`[${HELLO_WORLD_QUEUE}] job ${job.id}:`, job.data);
  }
}

async function main(): Promise<void> {
  // Vor start() registrieren, damit auch Start-/Laufzeitfehler sichtbar sind.
  boss.on("error", (error) => console.error("[pg-boss] error:", error));
  boss.on("warning", (warning) => console.warn("[pg-boss] warning:", warning));

  await boss.start();
  await boss.createQueue(HELLO_WORLD_QUEUE);
  await boss.work(HELLO_WORLD_QUEUE, handleHelloWorld);

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
