import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserId, getVerifiedSessionUserId } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/user-data-access";
import { ProfileForm } from "../_components/profile-form";

// Server-seitiger Zugriffsschutz (nicht nur clientseitig versteckt): ohne
// Session -> Redirect auf /anmelden. Profil + Verifizierungsstatus werden hier
// geladen und als Props an die Client-Form gereicht.
export default async function ProfilePage() {
  const requestHeaders = await headers();
  const userId = await getSessionUserId(requestHeaders);
  if (!userId) {
    redirect("/anmelden");
  }
  const verified = (await getVerifiedSessionUserId(requestHeaders)) !== null;
  const profile = await getProfileForUser(userId);

  return (
    <>
      <h1 className="app-title">Ihr Profil</h1>
      <p className="app-lead">
        Diese Daten sind Ihre Identität gegenüber Data-Brokern: Nach ihnen wird gesucht, in Ihrem
        Namen wird die Löschung verlangt. Je vollständiger die Angaben, desto treffsicherer die
        Anfragen.
      </p>
      <ProfileForm
        verified={verified}
        initialProfile={
          profile
            ? {
                firstName: profile.firstName ?? "",
                lastName: profile.lastName ?? "",
                emailAddresses: profile.emailAddresses ?? [],
                phoneNumbers: profile.phoneNumbers ?? [],
                postalAddresses: profile.postalAddresses ?? [],
                dateOfBirth: profile.dateOfBirth ?? "",
              }
            : null
        }
      />
    </>
  );
}
