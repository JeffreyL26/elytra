# GoKognito

Automatisierter Opt-Out-Service für DSGVO-basierte Datenlöschanfragen bei
Data-Brokern. Dieses Repository enthält den Monolithen (Next.js) inklusive
Public-Website und internem Admin-UI (ELYTRA) sowie das Datenmodell.

> Aktueller Stand: **Phase 2 — Mail-Pipeline** abgeschlossen (Worker via
> pg-boss, Outbound-Versand via SES im Dummy-Modus, Postmark-Inbound-Webhook,
> vier-stufiges Reply-Matching, LLM-Klassifikation).

## Voraussetzungen

- **Node.js 20+**
- **pnpm** (z. B. via `corepack enable`)
- **Docker Desktop** (für die lokale PostgreSQL-Instanz)

## Erst-Setup

```bash
pnpm install
cp .env.example .env        # Windows: copy .env.example .env
```

Die `.env` enthält die `DATABASE_URL`; die Default-Werte passen zur
lokalen Docker-Postgres-Konfiguration aus `docker-compose.yml`.

## Datenbank

```bash
pnpm db:up         # Postgres-Container starten (docker compose)
pnpm db:migrate    # Migrationen auf die DB anwenden
pnpm db:seed       # Dummy-Broker idempotent einspielen
```

Weitere DB-Befehle:

```bash
pnpm db:generate   # SQL-Migration aus dem Drizzle-Schema generieren
pnpm db:studio     # Drizzle Studio (GUI) auf localhost:4983
pnpm db:down       # Container stoppen
```

## Entwicklung

Zwei Prozesse, je ein Terminal:

```bash
pnpm dev           # Next.js Dev-Server auf localhost:3000 (Web + Webhooks)
pnpm worker        # Worker-Prozess (Mail-Versand, Inbound-Verarbeitung)
```

## Verifizieren

```bash
curl http://localhost:3000/api/brokers
```

Die Antwort listet die drei eingeseedeten Dummy-Broker als JSON — damit ist
belegt, dass DB, Drizzle und Next.js zusammenspielen.

## Phase 2 — Mail-Pipeline

Phase 2 ergänzt den Worker (pg-boss), den Outbound-Mail-Versand (AWS SES,
Dummy-Modus über `broker.is_dummy`), den Postmark-Inbound-Webhook, das
vier-stufige Reply-Matching und die LLM-Klassifikation (Claude). Dafür werden
zusätzliche `.env`-Variablen gebraucht (siehe `.env.example`):

- `ANTHROPIC_API_KEY` — für die LLM-Klassifikation
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — SES (nur für echten Versand; im Dummy-Modus ungenutzt)
- `MAIL_FROM_ADDRESS`, `MAIL_FROM_DOMAIN`, `REPLY_DOMAIN` — Absender und Reply-To-Token-Domain
- `POSTMARK_INBOUND_WEBHOOK_USERNAME`, `POSTMARK_INBOUND_WEBHOOK_PASSWORD` — HTTP-Basic-Auth des Inbound-Webhooks

### Phase 2 Smoke-Test

Durchläuft die komplette Pipeline lokal in einem Prozess gegen einen
Dummy-Broker (kein echter SES-/Postmark-Verkehr):

```bash
pnpm e2e
```

Der Test legt User + Profil + Prozess an, verschickt die Opt-Out-Mail
(Dummy-Modus), simuliert die Broker-Antwort per POST an den Inbound-Webhook,
verarbeitet sie (Matching → Klassifikation → Status) und gibt am Ende den
Prozess-Status und den Event-Verlauf aus. Anschließend werden die Testdaten
wieder entfernt.

Voraussetzungen: Postgres läuft (`pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`)
und `.env` enthält `MAIL_FROM_ADDRESS`, `REPLY_DOMAIN` sowie die
`POSTMARK_INBOUND_WEBHOOK_*`-Werte. Ist `ANTHROPIC_API_KEY` gesetzt, wird real
klassifiziert; andernfalls greift das Sicherheitsnetz (Klassifikations-Fehler →
`manual_review`).

## Projektstruktur

Unit-/Integrationstests liegen als `*.test.ts` neben dem jeweiligen Code.

```
gokognito/
├── src/
│   ├── app/                                  # Next.js App Router (Web-Prozess)
│   │   └── api/
│   │       ├── brokers/route.ts              # GET /api/brokers (Smoke-Test)
│   │       └── webhooks/
│   │           └── postmark-inbound/
│   │               └── route.ts              # Postmark Inbound-Webhook
│   ├── db/
│   │   ├── schema/
│   │   │   ├── index.ts                      # Re-Exports aller Schemas
│   │   │   ├── users.ts
│   │   │   ├── customer-profiles.ts
│   │   │   ├── brokers.ts
│   │   │   ├── opt-out-processes.ts
│   │   │   ├── process-events.ts
│   │   │   └── process-mails.ts              # Outbound/Inbound-Mails pro Prozess
│   │   ├── migrations/                       # Drizzle-generiert
│   │   ├── client.ts                         # exports { sql, db }
│   │   └── seed.ts                           # Seed-Script (Dummy-Broker)
│   ├── lib/
│   │   ├── env.ts                            # zod-validierte env vars
│   │   ├── ids.ts                            # cuid2 (createId + createProcessToken)
│   │   ├── branding.ts                       # SERVICE_NAME
│   │   ├── mail/
│   │   │   ├── send.ts                       # SES-Wrapper (Dummy-Modus first)
│   │   │   ├── match-inbound.ts              # Vier-stufiges Reply-Matching
│   │   │   └── templates/
│   │   │       └── opt-out-request.ts        # DSGVO-Mail-Template (DE/EN)
│   │   └── llm/
│   │       └── classify-inbound.ts           # LLM-Klassifikation (Claude Tool-Use)
│   ├── worker/                               # Worker-Prozess (pnpm worker)
│   │   ├── index.ts                          # Entry-Point + Queue-Registrierung
│   │   ├── queue.ts                          # pg-boss-Instanz (Worker)
│   │   ├── producer.ts                       # send-only enqueue (Web-Prozess)
│   │   └── jobs/
│   │       ├── send-opt-out-mail.ts
│   │       └── process-inbound-mail.ts
│   ├── scripts/
│   │   └── e2e-smoke.ts                       # End-to-End-Smoke (pnpm e2e)
│   └── data/
│       └── dummy-brokers.ts                  # Statische Dummy-Broker-Definitionen
├── docker-compose.yml                        # nur Postgres
├── drizzle.config.ts
├── biome.json
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## Quality

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome check
pnpm format        # biome format --write
```
