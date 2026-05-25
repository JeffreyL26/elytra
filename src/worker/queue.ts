import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

// Einziger Queue-Name fuer den Phase-2-Smoke-Test.
export const HELLO_WORLD_QUEUE = "hello-world";

// Eine pg-boss-Instanz pro Prozess. boss.start() legt das pgboss.*-Schema
// beim ersten Lauf idempotent an und migriert es bei Versionswechseln --
// bewusst getrennt von den Drizzle-Migrations.
//
// Keine eigene Logging-Config: pg-boss ist per Default still und meldet
// Auffaelligkeiten ueber 'error'/'warning'-Events (siehe index.ts). Das
// liefert lokal genug Diagnose ohne Debug-Spam in Production.
export const boss = new PgBoss({ connectionString: env.DATABASE_URL });
