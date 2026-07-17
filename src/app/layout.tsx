import type { Metadata } from "next";
import { SERVICE_NAME } from "@/lib/branding";
import "./tokens.css";

export const metadata: Metadata = {
  title: SERVICE_NAME,
  description: "Automatisierter Opt-Out-Service für DSGVO-Datenlöschanfragen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
