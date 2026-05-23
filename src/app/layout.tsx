import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InkogniGO",
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
