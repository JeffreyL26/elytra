import type { Metadata } from "next";
import { mono, sans, serif } from "@/app/fonts";
import "./marketing.css";

export const metadata: Metadata = {
  title: "GoKognito | Werden Sie unsichtbar für Datenhändler",
  description:
    "GoKognito setzt Ihr Recht auf Löschung durch: automatisiert, DSGVO-konform und dauerhaft. Wir entfernen Ihre persönlichen Daten aus den Datenbanken von Data-Brokern.",
};

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`site ${serif.variable} ${sans.variable} ${mono.variable}`} data-theme="dark">
      {children}
    </div>
  );
}
