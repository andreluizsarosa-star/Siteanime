import type { Metadata } from "next";
import "./globals.css";
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
