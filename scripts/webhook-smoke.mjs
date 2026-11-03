import { createHmac, randomUUID } from "node:crypto";
const base = process.env.APP_URL || "http://localhost:3000";
const mode = await (await fetch(base + "/api/session")).json();
if (mode.mode !== "demo")
  throw new Error("Este teste só pode rodar em demonstração.");
if (!process.env.SANDBOX_WEBHOOK_SECRET)
  throw new Error("Execute npm run setup:local antes de testar webhooks.");
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "colecionador@nexo.test",
    password: "NexoDemo2026!",
  }),
});
if (!login.ok) throw new Error("Falha de login");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const listing = (await (await fetch(base + "/api/catalog")).json()).find(
  (l) => l.id === "demo-bulbasaur-base",
);
const checkout = await fetch(base + "/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    items: [
      { listingId: listing.id, expectedPrice: listing.price, quantity: 1 },
    ],
    key: randomUUID(),
    addressId: "demo-address",
    method: "pix",
  }),
});
if (!checkout.ok) throw new Error(await checkout.text());
const order = await checkout.json();
const raw = JSON.stringify({
  eventId: randomUUID(),
  orderId: order.id,
  amount: order.total,
  status: "approved",
});
const sig = createHmac("sha256", process.env.SANDBOX_WEBHOOK_SECRET)
  .update(raw)
  .digest("hex");
const send = (signature) =>
  fetch(base + "/api/payments/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-nexo-signature": signature } : {}),
    },
    body: raw,
  });
if ((await send(null)).status !== 401)
  throw new Error("Webhook sem assinatura não foi recusado");
const first = await send(sig);
if (!first.ok || (await first.json()).status !== "paid")
  throw new Error("Webhook válido não confirmou pagamento");
const repeated = await send(sig);
if (!repeated.ok || !(await repeated.json()).duplicate)
  throw new Error("Webhook não é idempotente");
console.log(
  "PASS: webhook HTTP sem assinatura recusado; HMAC válido confirmou pagamento; replay idempotente. Nenhum segredo exibido.",
);
