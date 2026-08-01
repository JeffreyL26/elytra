import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mono, sans, serif } from "@/app/fonts";
import { requireAdminSession } from "@/lib/auth-session";
import "./elytra.css";

// ELYTRA -- interne Sachbearbeiter-Sicht (Lastenheft: dort als Tauri-App
// gedacht; bewusst als minimaler Next-Admin-Bereich umgesetzt,
// Roadmap-Entscheidung #3).
//
// Der automatisierte Service ist der Default. ELYTRA ist der dokumentierte
// AUSNAHMEPFAD: wenn etwas ausserhalb des Mailkanals passiert oder ein Vorgang
// haengt.
//
// KOMPLETT hinter requireAdminSession -- und zwar im Layout, damit jede Route
// des Segments per Konstruktion geschuetzt ist und eine neue Unterseite den
// Guard nicht vergessen kann. Kein Admin -> notFound(): 404 statt 403, die
// Existenz des Bereichs wird nicht verraten.
export const metadata: Metadata = {
  title: "ELYTRA",
  robots: { index: false, follow: false },
};

export default async function ElytraLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const adminUserId = await requireAdminSession(await headers());
  if (!adminUserId) {
    notFound();
  }

  return (
    <div className={`elytra ${serif.variable} ${sans.variable} ${mono.variable}`} data-theme="dark">
      <header className="ely-nav">
        <div className="ely-nav__inner">
          <Link href="/elytra" className="ely-nav__brand">
            ELYTRA
          </Link>
          <span className="ely-nav__note">Interne Sachbearbeitung</span>
        </div>
      </header>
      <main className="ely-main">{children}</main>
    </div>
  );
}
