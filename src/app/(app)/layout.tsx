import type { Metadata } from "next";
import { headers } from "next/headers";
import { mono, sans, serif } from "@/app/fonts";
import { getSessionUserId } from "@/lib/auth-session";
import { SERVICE_NAME } from "@/lib/branding";
import { AppNav } from "./_components/app-nav";
import "./app.css";

// App-Segment (eingeloggter Bereich): gleiche visuelle Sprache wie Marketing
// (geteilte Tokens/Fonts), aber ruhig und formularorientiert -- bewusst ohne
// three.js/Lenis/GSAP. Layout ist eine Server Component; der Session-Zustand
// wird hier EINMAL serverseitig gelesen und steuert die Nav.
export const metadata: Metadata = {
  title: `${SERVICE_NAME} — Konto`,
  description: "Ihr GoKognito-Konto: Profil und Einstellungen.",
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const userId = await getSessionUserId(await headers());

  return (
    <div className={`app ${serif.variable} ${sans.variable} ${mono.variable}`} data-theme="dark">
      <AppNav signedIn={userId !== null} />
      <main className="app-main" id="main">
        {children}
      </main>
      <footer className="app-footer">
        <div className="app-footer__inner">
          <span>© {SERVICE_NAME}</span>
          <span>DSGVO-konform. Ihre Daten gehören Ihnen.</span>
        </div>
      </footer>
    </div>
  );
}
