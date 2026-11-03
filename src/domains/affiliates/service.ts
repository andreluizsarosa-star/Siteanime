import { check } from "../../lib/core";
export const destinations: Record<string, string[]> = {
  Shopee: ["shopee.com.br", "shope.ee", "s.shopee.com.br"],
  "Mercado Livre": [
    "mercadolivre.com.br",
    "produto.mercadolivre.com.br",
    "mercadolivre.com",
    "meli.la",
  ],
};
export function affiliateURL(raw: string, platform: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  check(
    u.protocol === "https:" && !u.username && !u.password && !u.port,
    "Use uma URL HTTPS sem credenciais",
  );
  check(
    destinations[platform]?.includes(u.hostname),
    "Destino de afiliado não permitido",
  );
  return u.href;
}
