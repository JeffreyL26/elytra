import { z } from "zod";
import { requireAdminSession } from "@/lib/auth-session";
import { resolveProcessManually } from "@/lib/manual-resolution";
import {
  MANUAL_KNOWLEDGE_SOURCES,
  MANUAL_TERMINAL_STATUSES,
} from "@/lib/manual-resolution-contract";

// POST /api/elytra/processes/{processId}/resolve -- manueller Prozessabschluss.
// Vollstaendig hinter requireAdminSession: jeder Fehlschlag der Autorisierung
// antwortet 404, nie 403 (die Existenz des Admin-Bereichs wird nicht verraten).

const bodySchema = z.object({
  targetStatus: z.enum(MANUAL_TERMINAL_STATUSES),
  // Pflicht, nicht leer -- ein Eingriff ohne Begruendung ist im Audit-Trail
  // wertlos.
  note: z.string().trim().min(1),
  knowledgeSource: z.enum(MANUAL_KNOWLEDGE_SOURCES),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ processId: string }> },
): Promise<Response> {
  const adminUserId = await requireAdminSession(req.headers);
  if (!adminUserId) {
    return new Response(null, { status: 404 });
  }

  const { processId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Body ist kein gueltiges JSON" } },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))];
    return Response.json(
      {
        error: {
          code: "validation_failed",
          message: "Terminalstatus, Begründung und Erkenntnisquelle sind Pflicht",
          fields,
        },
      },
      { status: 400 },
    );
  }

  const result = await resolveProcessManually({
    processId,
    targetStatus: parsed.data.targetStatus,
    note: parsed.data.note,
    knowledgeSource: parsed.data.knowledgeSource,
    adminUserId,
  });

  if (!result.ok) {
    // Unbekannte processId -> 404 (gleiche Konvention wie oben).
    const status = result.error === "process_not_found" ? 404 : 400;
    return Response.json({ error: { code: result.error, message: result.error } }, { status });
  }

  return Response.json({ from: result.from, to: result.to }, { status: 200 });
}
