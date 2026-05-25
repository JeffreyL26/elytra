import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

export const PROCESS_INBOUND_MAIL_QUEUE = "process-inbound-mail";

// Enqueuing aus dem Web-Prozess (Webhook). Eigene, schlanke pg-boss-Instanz
// ohne Maintenance/Cron (supervise/schedule aus) -- die volle Verwaltung
// gehoert dem Worker-Prozess. Lazy gestartet, Queues idempotent angelegt.
let producer: PgBoss | null = null;
const ensuredQueues = new Set<string>();

export async function enqueue(queue: string, data: object): Promise<string | null> {
  if (!producer) {
    const instance = new PgBoss({
      connectionString: env.DATABASE_URL,
      supervise: false,
      schedule: false,
    });
    await instance.start();
    producer = instance;
  }
  if (!ensuredQueues.has(queue)) {
    await producer.createQueue(queue);
    ensuredQueues.add(queue);
  }
  return producer.send(queue, data);
}
