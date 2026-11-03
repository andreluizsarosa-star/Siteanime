import assert from "node:assert/strict";
const base = process.env.HOSTING_TEST_URL || "http://127.0.0.1:3100";
let ready = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(base + "/api/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) {
      const h = await r.json();
      assert.equal(h.mode, "demo");
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(ready, "Contêiner não ficou saudável");
const list = await (await fetch(base + "/api/catalog")).json();
assert.ok(list.length >= 9);
console.log("PASS: saúde HTTP e catálogo de demonstração.");
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "colecionador@nexo.test",
    password: "NexoDemo2026!",
  }),
});
assert.ok(login.ok, "Login falhou");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const session = await (
  await fetch(base + "/api/session", { headers: { cookie } })
).json();
assert.equal(session.user?.id, "demo-buyer");
const booster = (await (await fetch(base + "/api/boosters")).json())[0];
async function post(path, body) {
  const r = await fetch(base + "/api/" + path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok, await r.clone().text());
  return r.json();
}
const order = await post("checkout", {
  items: [
    {
      campaignId: booster.id,
      quantity: 1,
      version: booster.version,
      stockToken: booster.stockToken,
      expectedPrice: booster.price,
    },
  ],
  key: crypto.randomUUID(),
  addressId: "demo-address",
  method: "pix",
});
await post("payments/simulate", { orderId: order.id, status: "approved" });
const getOrder = async () =>
  (
    await fetch(base + "/api/orders/" + order.id, { headers: { cookie } })
  ).json();
const detail = await getOrder();
assert.equal(detail.results.length, 6);
await post("boosters/reveal", { resultId: detail.results[0].id, all: true });
const repeated = await getOrder();
assert.deepEqual(
  repeated.results.map((r) => r.physical_id),
  detail.results.map((r) => r.physical_id),
);
assert.ok(repeated.results.every((r) => r.revealed));
console.log(
  "PASS: sessão, checkout, pagamento sandbox, abertura e resultado persistente na imagem de hospedagem.",
);
