import { createHmac, timingSafeEqual } from "node:crypto";
import { check } from "../../lib/core";
export interface PaymentProvider {
  name: string;
  live: boolean;
}
export const provider: PaymentProvider = { name: "Sandbox local", live: false };
export function verifyWebhook(body: string, signature: string | null) {
  const secret = process.env.SANDBOX_WEBHOOK_SECRET;
  check(secret && secret.length >= 24, "Webhook sandbox não configurado", 503);
  const expected = createHmac("sha256", secret).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature || "", "hex");
  } catch {
    return false;
  }
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
// Mercado Pago is a candidate, not an enabled integration. Never send card data here.
export function requireSandbox() {
  check(
    process.env.APP_MODE !== "production" &&
      (process.env.PAYMENT_PROVIDER || "sandbox") === "sandbox",
    "Pagamento real ainda não habilitado",
    503,
  );
}
