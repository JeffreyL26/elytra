import type { Metadata } from "next";
import { SERVICE_NAME } from "@/lib/branding";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
