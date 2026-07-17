import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth-session";
import { DeleteAccountForm } from "../_components/delete-account-form";

// Server-seitiger Zugriffsschutz wie /profil. Bewusst KEIN Verify-Erfordernis:
// die Konto-Loeschung steht auch unverifizierten Konten offen (Endpunkt-
// Semantik, api-contract 2.5).
export default async function AccountPage() {
  const userId = await getSessionUserId(await headers());
  if (!userId) {
    redirect("/anmelden");
  }

  return (
    <>
      <h1 className="app-title">Konto</h1>
      <p className="app-lead">
        Hier verwalten Sie Ihr GoKognito-Konto. Die Löschung entfernt alle Ihre Daten dauerhaft —
        das ist Ihr Recht, und wir machen es Ihnen nicht schwer.
      </p>
      <DeleteAccountForm />
    </>
  );
}
