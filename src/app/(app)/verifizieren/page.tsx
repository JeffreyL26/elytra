import { headers } from "next/headers";
import Link from "next/link";
import { getSessionUserId, getVerifiedSessionUserId } from "@/lib/auth-session";

// Token-Landing aus der Bestaetigungs-Mail. Der Link in der Mail zeigt auf
// Better Auths GET /api/auth/verify-email?token=...&callbackURL=/verifizieren --
// Better Auth verifiziert und leitet hierher weiter (bei Fehlern mit
// ?error=...). Die Seite verlaesst sich NICHT allein auf den Query-Param,
// sondern liest den echten Verifizierungszustand aus der DB (SSoT
// emailVerifiedAt) -- ein Direktbesuch ohne Kontext zeigt so den korrekten
// Stand statt einer falschen Erfolgsmeldung.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const requestHeaders = await headers();
  const sessionUserId = await getSessionUserId(requestHeaders);
  const verifiedUserId = sessionUserId ? await getVerifiedSessionUserId(requestHeaders) : null;

  return (
    <>
      <h1 className="app-title">E-Mail-Verifizierung</h1>
      <div className="app-card app-form">
        {error ? (
          <>
            <p className="app-alert app-alert--error" role="alert">
              Der Bestätigungslink ist ungültig oder abgelaufen. Bitte melden Sie sich an und
              fordern Sie eine neue Bestätigungs-E-Mail an.
            </p>
            <p className="app-form__alt">
              <Link href="/anmelden">Zur Anmeldung</Link>
            </p>
          </>
        ) : verifiedUserId ? (
          <>
            <p className="app-alert app-alert--success">
              Ihre E-Mail-Adresse ist bestätigt. Sie können jetzt Ihr Profil anlegen und bearbeiten.
            </p>
            <p className="app-form__alt">
              <Link href="/profil">Weiter zum Profil</Link>
            </p>
          </>
        ) : sessionUserId ? (
          <>
            <p className="app-alert app-alert--info">
              Ihre E-Mail-Adresse ist noch nicht bestätigt. Bitte öffnen Sie den Link aus der
              Bestätigungs-E-Mail.
            </p>
            <p className="app-form__alt">
              <Link href="/profil">Zum Profil</Link>
            </p>
          </>
        ) : (
          <>
            <p className="app-alert app-alert--info">
              Bitte öffnen Sie den Bestätigungslink aus Ihrer E-Mail. Wenn Sie bereits ein Konto
              haben, können Sie sich anmelden.
            </p>
            <p className="app-form__alt">
              <Link href="/anmelden">Zur Anmeldung</Link>
            </p>
          </>
        )}
      </div>
    </>
  );
}
