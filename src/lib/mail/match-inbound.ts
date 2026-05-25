import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { optOutProcesses, processMails } from "@/db/schema";
import { env } from "@/lib/env";

export type ProcessMailRow = typeof processMails.$inferSelect;

export interface MatchResult {
  processId: string | null;
  // 4 = nicht gematcht (Fallback).
  matchStage: 1 | 2 | 3 | 4;
  // Grobe Einschaetzung pro Stufe -- Hilfsfeld fuers Logging/Tuning,
  // unabhaengig von der LLM-Klassifikation (Aufgabe 8).
  confidence: "high" | "medium" | "low";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitiver Header-Zugriff (Mail-Header sind case-insensitiv).
function getHeader(headers: Record<string, string | string[]> | null, name: string): string[] {
  if (!headers) {
    return [];
  }
  const target = name.toLowerCase();
  const values: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (typeof value === "string") {
      values.push(value);
    } else {
      values.push(...value);
    }
  }
  return values;
}

// Alle moeglichen Empfaenger-Strings: To-Spalte, To-Header und rawPayload.ToFull.
function collectToCandidates(mail: ProcessMailRow): string[] {
  const candidates: string[] = [];
  if (mail.toAddress) {
    candidates.push(mail.toAddress);
  }
  candidates.push(...getHeader(mail.headers, "To"));
  const toFull = mail.rawPayload?.ToFull;
  if (Array.isArray(toFull)) {
    for (const entry of toFull) {
      if (typeof entry === "object" && entry !== null && "Email" in entry) {
        const email = entry.Email;
        if (typeof email === "string") {
          candidates.push(email);
        }
      }
    }
  }
  return candidates;
}

function extractReplyTokens(candidates: string[], replyDomain: string): string[] {
  const pattern = new RegExp(`proc-([a-z0-9]{16})@${escapeRegExp(replyDomain)}`, "gi");
  const tokens = new Set<string>();
  for (const candidate of candidates) {
    for (const match of candidate.matchAll(pattern)) {
      tokens.add(match[1].toLowerCase());
    }
  }
  return [...tokens];
}

// Message-IDs (inkl. spitzer Klammern) aus In-Reply-To und References.
// Klammern bleiben erhalten, damit der Vergleich gegen die in derselben Form
// gespeicherte provider_message_id der Outbound-Mail aufgeht (send.ts setzt
// den Message-ID-Header als <...> und speichert exakt diese Form).
function collectReferencedMessageIds(mail: ProcessMailRow): string[] {
  const raw = [...getHeader(mail.headers, "In-Reply-To"), ...getHeader(mail.headers, "References")];
  const ids = new Set<string>();
  for (const value of raw) {
    for (const match of value.matchAll(/<[^>]+>/g)) {
      ids.add(match[0]);
    }
  }
  return [...ids];
}

async function findProcessByTokens(tokens: string[]): Promise<string | null> {
  if (tokens.length === 0) {
    return null;
  }
  const [row] = await db
    .select({ id: optOutProcesses.id })
    .from(optOutProcesses)
    .where(inArray(optOutProcesses.processToken, tokens))
    .limit(1);
  return row?.id ?? null;
}

export async function matchInbound(mail: ProcessMailRow): Promise<MatchResult> {
  // Stufe 1: Token in einer To-Adresse (proc-<token>@<REPLY_DOMAIN>).
  const replyDomain = env.REPLY_DOMAIN;
  if (replyDomain) {
    const tokens = extractReplyTokens(collectToCandidates(mail), replyDomain);
    const processId = await findProcessByTokens(tokens);
    if (processId) {
      return { processId, matchStage: 1, confidence: "high" };
    }
  }

  // Stufe 2: Token im Subject ([Ref: <token>]), tolerant ggue. Re:/AW:/Fwd:.
  if (mail.subject) {
    const match = mail.subject.match(/\[Ref:\s*([a-z0-9]{16})\]/i);
    if (match) {
      const processId = await findProcessByTokens([match[1].toLowerCase()]);
      if (processId) {
        return { processId, matchStage: 2, confidence: "high" };
      }
    }
  }

  // Stufe 3: In-Reply-To/References -> provider_message_id einer Outbound-Mail.
  const referencedIds = collectReferencedMessageIds(mail);
  if (referencedIds.length > 0) {
    const [row] = await db
      .select({ processId: processMails.processId })
      .from(processMails)
      .where(
        and(
          eq(processMails.direction, "outbound"),
          inArray(processMails.providerMessageId, referencedIds),
        ),
      )
      .limit(1);
    if (row?.processId) {
      // Medium: Threading kann durch Weiterleitungen verlorengehen/verfaelscht.
      return { processId: row.processId, matchStage: 3, confidence: "medium" };
    }
  }

  // Stufe 4: kein Match -> bleibt unzugeordnet (ELYTRA-Queue).
  return { processId: null, matchStage: 4, confidence: "low" };
}
