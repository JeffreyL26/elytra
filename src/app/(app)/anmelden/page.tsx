import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth-session";
import { LoginForm } from "../_components/login-form";

export default async function LoginPage() {
  const userId = await getSessionUserId(await headers());
  if (userId) {
    redirect("/profil");
  }
  return (
    <>
      <h1 className="app-title">Anmelden</h1>
      <p className="app-lead">Melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an.</p>
      <LoginForm />
    </>
  );
}
