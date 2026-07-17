import { getSessionUserId, getVerifiedSessionUserId } from "@/lib/auth-session";
import { type CustomerProfileInput, customerProfileSchema } from "@/lib/customer-profile-schema";
import { isTerminal } from "@/lib/status-transitions";
import {
  type CustomerProfile,
  createProfileForUser,
  deleteProfileForUser,
  getProcessesForUser,
  getProfileForUser,
  replaceProfileForUser,
} from "@/lib/user-data-access";

// Profil-CRUD fuer den eingeloggten User (api-contract.md § 2). Kein UI.
//
// INVARIANTEN (Multi-Tenant-Spec):
//   * userId stammt AUSSCHLIESSLICH aus der Session (getSessionUserId /
//     getVerifiedSessionUserId) -- NIE aus dem Request-Body. Ein userId/id im
//     Body wird vom Zod-Schema stillschweigend verworfen (unknown keys).
//   * Validierung ausschliesslich ueber customerProfileSchema -- kein zweiter
//     Validierungspfad.
//   * Reads ueber den bestehenden *ForUser-Layer.
//   * SCHREIBEN erfordert verifizierte E-Mail (Gate gegen SSoT emailVerifiedAt);
//     LESEN des eigenen Profils ist auch unverifiziert erlaubt.

function apiError(status: number, code: string, message: string, fields?: string[]): Response {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

// Response-Shape (alle Reads): Profilfelder + id/createdAt/updatedAt, OHNE userId
// (ergibt sich aus der Session, kein Grund sie zu spiegeln).
function toProfileResponse(p: CustomerProfile) {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    emailAddresses: p.emailAddresses,
    phoneNumbers: p.phoneNumbers,
    postalAddresses: p.postalAddresses,
    dateOfBirth: p.dateOfBirth,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Gemeinsame Schreib-Vorpruefung fuer POST/PUT: Session -> Verify-Gate -> Body
// -> Schema. Liefert entweder den (verifizierten) userId + geprueften Daten oder
// direkt die passende Fehler-Response.
type WriteContext = { userId: string; data: CustomerProfileInput };
async function resolveWrite(req: Request): Promise<WriteContext | Response> {
  const sessionUserId = await getSessionUserId(req.headers);
  if (!sessionUserId) {
    return apiError(401, "unauthorized", "Keine gueltige Session");
  }
  // Schreib-Gate: prueft die SSoT emailVerifiedAt. 401 (keine Session) und 403
  // (Session, aber unverifiziert) werden bewusst unterschieden.
  const userId = await getVerifiedSessionUserId(req.headers);
  if (!userId) {
    return apiError(
      403,
      "email_not_verified",
      "E-Mail nicht verifiziert — Schreibzugriff gesperrt",
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_json", "Request-Body ist kein gueltiges JSON");
  }

  const parsed = customerProfileSchema.safeParse(body);
  if (!parsed.success) {
    // Nur Feldnamen, nie Feldwerte (PII-Disziplin wie parseCustomerProfile).
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))];
    return apiError(400, "validation_failed", "Profil ist ungueltig", fields);
  }

  return { userId, data: parsed.data };
}

// GET /api/profile -- eigenes Profil lesen (Session, unverifiziert erlaubt).
export async function GET(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req.headers);
  if (!userId) {
    return apiError(401, "unauthorized", "Keine gueltige Session");
  }
  const profile = await getProfileForUser(userId);
  if (!profile) {
    return apiError(404, "not_found", "Kein Profil vorhanden");
  }
  return Response.json(toProfileResponse(profile), { status: 200 });
}

// POST /api/profile -- Profil anlegen (Session + verifiziert). 409 bei Existenz.
export async function POST(req: Request): Promise<Response> {
  const ctx = await resolveWrite(req);
  if (ctx instanceof Response) {
    return ctx;
  }
  const existing = await getProfileForUser(ctx.userId);
  if (existing) {
    return apiError(409, "profile_exists", "Profil existiert bereits — Aenderungen ueber PUT");
  }
  const created = await createProfileForUser(ctx.userId, ctx.data);
  return Response.json(toProfileResponse(created), { status: 201 });
}

// PUT /api/profile -- Profil vollstaendig ersetzen (Session + verifiziert).
export async function PUT(req: Request): Promise<Response> {
  const ctx = await resolveWrite(req);
  if (ctx instanceof Response) {
    return ctx;
  }
  const updated = await replaceProfileForUser(ctx.userId, ctx.data);
  if (!updated) {
    return apiError(404, "not_found", "Kein Profil zum Aendern vorhanden");
  }
  return Response.json(toProfileResponse(updated), { status: 200 });
}

// DELETE /api/profile -- eigenes Profil loeschen (Session). Lehnt ab, solange
// aktive (nicht-terminale) Prozesse existieren (api-contract.md § 2.4).
export async function DELETE(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req.headers);
  if (!userId) {
    return apiError(401, "unauthorized", "Keine gueltige Session");
  }
  const processes = await getProcessesForUser(userId);
  const active = processes.filter((p) => !isTerminal(p.status));
  if (active.length > 0) {
    return apiError(409, "processes_active", "Aktive Prozesse verhindern die Profil-Loeschung");
  }
  await deleteProfileForUser(userId);
  return Response.json({}, { status: 200 });
}
