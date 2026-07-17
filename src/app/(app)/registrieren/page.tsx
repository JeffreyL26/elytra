import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth-session";
import { missingCustomerStreamEnv } from "@/lib/mail/send-customer";
import { RegisterForm } from "../_components/register-form";

// Server Component: liest hier (und nur hier) den ehrlichen Mail-Zustand.
// Solange der Postmark-Customer-Stream nicht konfiguriert ist, laeuft der
// Verify-Mail-Adapter im Log-Modus -- dann darf die UI nicht "Mail versendet"
// behaupten. mailDeliveryActive kommt deshalb serverseitig aus derselben
// Quelle, die auch der Adapter nutzt (kein neuer API-Endpunkt noetig).
export default async function RegisterPage() {
  const userId = await getSessionUserId(await headers());
  if (userId) {
    redirect("/profil");
  }
  const mailDeliveryActive = missingCustomerStreamEnv().length === 0;

  return (
    <>
      <h1 className="app-title">Konto erstellen</h1>
      <p className="app-lead">
        Registrieren Sie sich mit E-Mail-Adresse und Passwort. Nach der Bestätigung Ihrer
        E-Mail-Adresse können Sie Ihr Profil anlegen.
      </p>
      <RegisterForm mailDeliveryActive={mailDeliveryActive} />
    </>
  );
}
