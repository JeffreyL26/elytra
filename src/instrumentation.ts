// Next.js Startup-Hook: register() laeuft EINMAL beim Serverstart (offizieller,
// stabiler Mechanismus in Next 16 -- kein Hack). Hier der laute Web-Preflight:
// fehlt eine Auth-Pflicht-Variable, startet der Web-Prozess gar nicht erst,
// statt beim ersten Auth-Request zu krachen.
export async function register(): Promise<void> {
  // Nur im Node-Runtime pruefen (nicht im Edge-Runtime); dynamischer Import,
  // damit env/DB-Code nicht ins Edge-Bundle gezogen wird.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertRuntimeEnv } = await import("@/lib/runtime-env");
    assertRuntimeEnv("web");
  }
}
