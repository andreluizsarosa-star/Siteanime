import "@fontsource-variable/inter";
import type { Metadata } from "next";
import "./globals.css";
import "./marketplace-theme.css";
export const metadata: Metadata = {
  title: `${process.env.NEXT_PUBLIC_SITE_NAME || "Nexo TCG"} · Sua próxima grande descoberta`,
  description:
    "Marketplace brasileiro de cartas e colecionáveis. Ambiente de demonstração.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
