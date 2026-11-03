import { beforeAll, describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
process.env.DATA_DIR = mkdtempSync(resolve(tmpdir(), "nexo-test-"));
process.env.APP_MODE = "demo";
process.env.MAIL_OUTBOX_DIR = mkdtempSync(resolve(tmpdir(), "nexo-mail-test-"));
process.env.DATABASE_URL = process.env.NEXO_TEST_DATABASE_URL || "";
import { seed } from "../src/lib/seed";
import { query, transaction } from "../src/lib/db";
import { commission, reversedCommission, id } from "../src/lib/core";
import {
  checkout,
  paymentEvent,
  refund,
  expireReservations,
  orderAccess,
} from "../src/domains/orders/service";
import { capacity, draw, estimate } from "../src/domains/boosters/rules";
import { affiliateURL } from "../src/domains/affiliates/service";
import {
  currentUser,
  login,
  requireUser,
  type User,
} from "../src/domains/users/auth";
import { verifyWebhook } from "../src/domains/payments/provider";
import { createHmac } from "node:crypto";
let buyer: User, seller: User, admin: User;
beforeAll(async () => {
  if (process.env.NEXO_TEST_DATABASE_URL)
    await query(
      "TRUNCATE users,cards,affiliates,audit,rate_limits,webhook_events CASCADE",
    );
  await seed();
  [buyer] = await query<User>("SELECT * FROM users WHERE id=$1", [
    "demo-buyer",
  ]);
  [seller] = await query<User>("SELECT * FROM users WHERE id=$1", [
    "demo-seller",
  ]);
  [admin] = await query<User>("SELECT * FROM users WHERE id=$1", [
    "demo-admin",
  ]);
});
async function buy(
  listingId = "demo-bulbasaur-base",
  quantity = 1,
  key = id(),
) {
  return checkout(buyer, [{ listingId, quantity }], key, "demo-address", "pix");
}
async function paid() {
  const o = await buy();
  await paymentEvent({
    eventId: id(),
    orderId: o.id,
    amount: o.total,
    status: "approved",
  });
  return o;
}
describe("Comissão em centavos", () => {
  it("cobra 5% de R$100 sem frete", () => expect(commission(10000)).toBe(500));
  it("arredonda meio centavo para cima", () => {
    expect(commission(10)).toBe(1);
    expect(commission(9)).toBe(0);
    expect(commission(1999)).toBe(100);
  });
  it("reverte proporcionalmente sem ultrapassar a comissão original", () => {
    expect(reversedCommission(500, 3333, 10000)).toBe(167);
    expect(reversedCommission(500, 10000, 10000)).toBe(500);
  });
  it("rejeita moedas fracionárias e negativas", () => {
    expect(() => commission(1.5)).toThrow();
    expect(() => commission(-1)).toThrow();
  });
});
describe("Estoque, pagamentos e pedidos", () => {
  it("reserva múltiplos vendedores e separa frete da comissão", async () => {
    const o = await checkout(
      buyer,
      [
        { listingId: "demo-charizard-base", quantity: 1 },
        { listingId: "demo-luffy-st01", quantity: 1 },
      ],
      id(),
      "demo-address",
      "card",
    );
    expect(o.shipping).toBe(3000);
    expect(o.commission).toBe(commission(28990) + commission(24990));
    expect(
      (await query("SELECT * FROM suborders WHERE order_id=$1", [o.id])).length,
    ).toBe(2);
  });
  it("idempotência do checkout não reserva estoque duas vezes", async () => {
    const key = id();
    const a = await buy("demo-pikachu-base", 1, key);
    const b = await buy("demo-pikachu-base", 1, key);
    expect(a.id).toBe(b.id);
  });
  it("somente uma compra consegue reservar a última unidade", async () => {
    await query("UPDATE listings SET stock=1 WHERE id=$1", [
      "demo-blastoise-base",
    ]);
    const r = await Promise.allSettled([
      buy("demo-blastoise-base"),
      buy("demo-blastoise-base"),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(
      (
        await query("SELECT stock FROM listings WHERE id=$1", [
          "demo-blastoise-base",
        ])
      )[0].stock,
    ).toBe(0);
  });
  it("webhook repetido confirma uma vez e preserva conteúdo", async () => {
    const o = await buy();
    const e = {
      eventId: id(),
      orderId: o.id,
      amount: o.total,
      status: "approved" as const,
    };
    await paymentEvent(e);
    expect(await paymentEvent(e)).toEqual({ duplicate: true });
    await expect(paymentEvent({ ...e, amount: o.total + 1 })).rejects.toThrow(
      "conteúdo diferente",
    );
    expect(
      await query("SELECT * FROM webhook_events WHERE event_id=$1", [
        e.eventId,
      ]),
    ).toHaveLength(1);
  });
  it("pagamento divergente não confirma nem consome evento", async () => {
    const o = await buy();
    const eventId = id();
    await expect(
      paymentEvent({ eventId, orderId: o.id, amount: 1, status: "approved" }),
    ).rejects.toThrow("divergente");
    expect(
      await query("SELECT * FROM webhook_events WHERE event_id=$1", [eventId]),
    ).toHaveLength(0);
  });
  it("expiração libera estoque uma única vez e pagamento tardio é estornado", async () => {
    const o = await buy("demo-nami-op01");
    await query(
      "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [o.id],
    );
    await transaction(expireReservations);
    const before = (
      await query("SELECT stock FROM listings WHERE id=$1", ["demo-nami-op01"])
    )[0].stock;
    await transaction(expireReservations);
    expect(
      (
        await query("SELECT stock FROM listings WHERE id=$1", [
          "demo-nami-op01",
        ])
      )[0].stock,
    ).toBe(before);
    await paymentEvent({
      eventId: id(),
      orderId: o.id,
      amount: o.total,
      status: "approved",
    });
    const [late] = await query("SELECT * FROM orders WHERE id=$1", [o.id]);
    expect(late.status).toBe("late_payment");
    expect(late.refunded).toBe(o.total);
    expect(
      (
        await query("SELECT stock FROM listings WHERE id=$1", [
          "demo-nami-op01",
        ])
      )[0].stock,
    ).toBe(before);
  });
  it("falha de pagamento devolve as unidades", async () => {
    const o = await buy("demo-zoro-op01");
    const [before] = await query("SELECT stock FROM listings WHERE id=$1", [
      "demo-zoro-op01",
    ]);
    await paymentEvent({
      eventId: id(),
      orderId: o.id,
      amount: o.total,
      status: "failed",
    });
    expect(
      (
        await query("SELECT stock FROM listings WHERE id=$1", [
          "demo-zoro-op01",
        ])
      )[0].stock,
    ).toBe(before.stock + 1);
  });
  it("reembolso parcial é idempotente e reverte comissão acumulada", async () => {
    const o = await paid();
    const [i] = await query("SELECT * FROM order_items WHERE order_id=$1", [
      o.id,
    ]);
    const key = id();
    const a = await refund(admin, i.id, 333, key);
    const b = await refund(admin, i.id, 333, key);
    expect(a.id).toBe(b.id);
    await refund(admin, i.id, i.subtotal - 333, id());
    const [item] = await query("SELECT * FROM order_items WHERE id=$1", [i.id]);
    expect(item.refunded).toBe(i.subtotal);
    expect(item.commission_reversed).toBe(i.commission);
    await expect(refund(admin, i.id, 1, id())).rejects.toThrow();
  });
  it("snapshots persistem após edição do anúncio", async () => {
    const o = await paid();
    await query("UPDATE listings SET title=$1 WHERE id=$2", [
      "Novo título",
      "demo-bulbasaur-base",
    ]);
    const [i] = await query("SELECT * FROM order_items WHERE order_id=$1", [
      o.id,
    ]);
    expect(i.snapshot.title).toBe("Bulbasaur");
    await query("UPDATE listings SET title=$1 WHERE id=$2", [
      "Bulbasaur",
      "demo-bulbasaur-base",
    ]);
  });
  it("afiliados não entram no checkout interno", async () => {
    await expect(
      checkout(buyer, [{ quantity: 1 } as any], id(), "demo-address", "pix"),
    ).rejects.toThrow("externas");
  });
});
describe("Boosters", () => {
  const rules = [
    { group: "comum", count: 5 },
    { group: "rara", count: 1 },
  ];
  it("calcula capacidade e garante grupos sem reposição", () => {
    const stock = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      group_name: i < 20 ? "comum" : "rara",
    }));
    expect(capacity(rules, stock)).toBe(4);
    for (let i = 0; i < 30; i++) {
      const result = draw(rules, stock);
      expect(result.filter((r) => r.group_name === "comum")).toHaveLength(5);
      expect(result.filter((r) => r.group_name === "rara")).toHaveLength(1);
      expect(new Set(result.map((r) => r.id)).size).toBe(6);
    }
  });
  it("rejeita garantias impossíveis e grupos duplicados", () => {
    expect(() => draw(rules, [{ group_name: "rara" }])).toThrow("insuficiente");
    expect(() =>
      capacity(
        [
          { group: "a", count: 1 },
          { group: "a", count: 1 },
        ],
        [],
      ),
    ).toThrow("Grupos");
  });
  it("não inventa valor esperado sem referência", () => {
    expect(
      estimate(
        [{ group: "a", count: 1 }],
        [{ group_name: "a", reference_value: null }],
      ),
    ).toBeNull();
    expect(
      estimate(
        [{ group: "a", count: 2 }],
        [
          { group_name: "a", reference_value: 100 },
          { group_name: "a", reference_value: 300 },
        ],
      ),
    ).toBe(400);
  });
  it("resultados são permanentes após webhook repetido e outra compra não recebe as mesmas unidades", async () => {
    const create = () =>
      checkout(
        buyer,
        [{ campaignId: "pokemon-starter-demo", quantity: 1, version: 1 }],
        id(),
        "demo-address",
        "pix",
      );
    const a = await create();
    const b = await create();
    const ra = await query(
      "SELECT * FROM booster_results WHERE order_id=$1 ORDER BY id",
      [a.id],
    );
    const rb = await query("SELECT * FROM booster_results WHERE order_id=$1", [
      b.id,
    ]);
    expect(ra).toHaveLength(6);
    const [snapshot] = await query(
      "SELECT snapshot FROM order_items WHERE order_id=$1",
      [a.id],
    );
    expect(snapshot.snapshot.probabilities).toHaveLength(2);
    expect(snapshot.snapshot.stockToken).toHaveLength(64);
    expect(snapshot.snapshot.referenceExpected).toBeNull();
    expect(
      rb.some((r) => ra.some((x) => x.physical_id === r.physical_id)),
    ).toBe(false);
    const event = {
      eventId: id(),
      orderId: a.id,
      amount: a.total,
      status: "approved" as const,
    };
    await paymentEvent(event);
    await paymentEvent(event);
    expect(
      (
        await query(
          "SELECT physical_id FROM booster_results WHERE order_id=$1 ORDER BY id",
          [a.id],
        )
      ).map((r) => r.physical_id),
    ).toEqual(ra.map((r) => r.physical_id));
    expect(
      await query(
        "SELECT * FROM physical_cards WHERE reserved_order=$1 AND state='sold'",
        [a.id],
      ),
    ).toHaveLength(6);
  });
  it("recusa alteração de composição aceita", async () => {
    await expect(
      checkout(
        buyer,
        [{ campaignId: "pokemon-starter-demo", quantity: 1, version: 99 }],
        id(),
        "demo-address",
        "pix",
      ),
    ).rejects.toThrow("Composição");
  });
});
describe("Segurança e fronteiras", () => {
  it("sessão autenticada e autorização de papéis", async () => {
    const token = await login("colecionador@nexo.test", "NexoDemo2026!");
    expect((await currentUser(token))?.id).toBe(buyer.id);
    expect(await currentUser("invalido")).toBeNull();
    expect(() => requireUser(null)).toThrow();
    expect(() => requireUser(buyer, ["admin"])).toThrow();
    expect(() => requireUser(admin, ["admin"])).not.toThrow();
  });
  it("outro comprador não lê pedido ou solicita reembolso", async () => {
    const o = await paid();
    const stranger = { ...buyer, id: "stranger" };
    await expect(
      transaction((db) => orderAccess(db, stranger, o.id)),
    ).rejects.toThrow("Sem acesso");
    await expect(refund(buyer, "any", 100, id())).rejects.toThrow("permissão");
    expect((await transaction((db) => orderAccess(db, seller, o.id))).id).toBe(
      o.id,
    );
  });
  it("destinos de afiliados são exatos e preservam atribuição", () => {
    expect(
      affiliateURL(
        "https://shopee.com.br/item?utm_source=nexo&af_id=123",
        "Shopee",
      ),
    ).toContain("af_id=123");
    for (const url of [
      "http://shopee.com.br/",
      "https://shopee.com.br.evil.com/",
      "https://user:pass@shopee.com.br/",
      "javascript:alert(1)",
    ])
      expect(() => affiliateURL(url, "Shopee")).toThrow();
  });
  it("webhooks exigem assinatura HMAC do corpo exato", () => {
    process.env.SANDBOX_WEBHOOK_SECRET = "local-test-only-secret-123456789";
    const raw = '{"test":true}';
    const sig = createHmac("sha256", process.env.SANDBOX_WEBHOOK_SECRET)
      .update(raw)
      .digest("hex");
    expect(verifyWebhook(raw, sig)).toBe(true);
    expect(verifyWebhook(raw + " ", sig)).toBe(false);
    expect(verifyWebhook(raw, null)).toBe(false);
  });
});
import { refundShipping } from "../src/domains/orders/service";
import { publicImage, hash as sha } from "../src/lib/core";
import { GET, POST } from "../src/app/api/[...path]/route";
import { NextRequest } from "next/server";
async function request(path: string, body?: unknown, as?: User) {
  const token = as ? await login(as.email, "NexoDemo2026!") : undefined;
  const req = new NextRequest("http://localhost:3000/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { cookie: `nexo_session=${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return (body === undefined ? GET : POST)(req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
}
describe("Aceite e estorno de frete", () => {
  it("rejeita preço desatualizado e reutilização de chave com outro carrinho", async () => {
    await expect(
      checkout(
        buyer,
        [{ listingId: "demo-bulbasaur-base", quantity: 1, expectedPrice: 1 }],
        id(),
        "demo-address",
        "pix",
      ),
    ).rejects.toThrow("Preço atualizado");
    const key = id();
    await buy("demo-bulbasaur-base", 1, key);
    await expect(buy("demo-pikachu-base", 1, key)).rejects.toThrow(
      "outro carrinho",
    );
  });
  it("estoque alterado exige novo aceite das probabilidades", async () => {
    const stock = await query(
      "SELECT id FROM physical_cards WHERE campaign_id='pokemon-starter-demo' AND state='available' ORDER BY id",
    );
    const token = sha(stock.map((s) => s.id).join(","));
    const item = {
      campaignId: "pokemon-starter-demo",
      quantity: 1,
      version: 1,
      stockToken: token,
    };
    await checkout(buyer, [item], id(), "demo-address", "pix");
    await expect(
      checkout(buyer, [item], id(), "demo-address", "pix"),
    ).rejects.toThrow("probabilidades");
  });
  it("reembolsa todo o produto e frete sem comissão adicional", async () => {
    const o = await paid();
    const [i] = await query("SELECT * FROM order_items WHERE order_id=$1", [
      o.id,
    ]);
    const [s] = await query("SELECT * FROM suborders WHERE order_id=$1", [
      o.id,
    ]);
    await refund(admin, i.id, i.subtotal, id());
    const r = await refundShipping(admin, s.id, s.shipping, id());
    expect(r.commission_reversed).toBe(0);
    const [done] = await query("SELECT * FROM orders WHERE id=$1", [o.id]);
    expect(done.status).toBe("refunded");
    expect(done.refunded).toBe(done.total);
  });
});
describe("Autorização HTTP e privacidade", () => {
  it("admin bloqueado para visitante e comprador", async () => {
    expect((await request("admin/users")).status).toBe(401);
    expect((await request("admin/users", undefined, buyer)).status).toBe(403);
    expect((await request("admin/users", undefined, admin)).status).toBe(200);
  });
  it("perfil público nunca revela documento, endereço ou e-mail", async () => {
    const res = await request("seller/demo-seller");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.seller.email).toBeUndefined();
    expect(data.seller.document).toBeUndefined();
    expect(data.seller.password_hash).toBeUndefined();
  });
  it("não permite avaliar compra de outra pessoa", async () => {
    const o = await paid();
    const r = await request(
      "reviews",
      { orderId: o.id, sellerId: seller.id, rating: 5, body: "Teste" },
      admin,
    );
    expect(r.status).toBe(403);
  });
  it("resultado não é exposto nem revelável antes do pagamento", async () => {
    const o = await checkout(
      buyer,
      [{ campaignId: "pokemon-starter-demo", quantity: 1, version: 1 }],
      id(),
      "demo-address",
      "pix",
    );
    const [result] = await query(
      "SELECT id FROM booster_results WHERE order_id=$1",
      [o.id],
    );
    const detail = await request("orders/" + o.id, undefined, buyer);
    expect((await detail.json()).results).toHaveLength(0);
    expect(
      (await request("boosters/reveal", { resultId: result.id }, buyer)).status,
    ).toBe(400);
    expect(
      (await request("boosters/reveal", { resultId: result.id }, seller))
        .status,
    ).toBe(403);
  });
  it("bloqueia mensagens e pedidos de terceiros", async () => {
    const o = await paid();
    expect(
      (
        await request("orders/" + o.id, undefined, {
          ...buyer,
          id: "demo-seller2",
          email: "otaku@nexo.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "messages",
          { orderId: o.id, body: "invasão" },
          { ...buyer, id: "demo-seller2", email: "otaku@nexo.test" },
        )
      ).status,
    ).toBe(403);
  });
  it("revela uma única vez e persiste o estado no servidor", async () => {
    const o = await checkout(
      buyer,
      [{ campaignId: "pokemon-starter-demo", quantity: 1, version: 1 }],
      id(),
      "demo-address",
      "pix",
    );
    await paymentEvent({
      eventId: id(),
      orderId: o.id,
      amount: o.total,
      status: "approved",
    });
    const [r] = await query("SELECT * FROM booster_results WHERE order_id=$1", [
      o.id,
    ]);
    expect(
      (await request("boosters/reveal", { resultId: r.id }, buyer)).status,
    ).toBe(200);
    expect(
      (await request("boosters/reveal", { resultId: r.id }, buyer)).status,
    ).toBe(200);
    expect(
      (await query("SELECT * FROM booster_results WHERE id=$1", [r.id]))[0]
        .revealed,
    ).toBe(true);
  });
  it("não aceita conteúdo HTML disfarçado de upload", () => {
    expect(() => publicImage("data:image/png;base64,PGh0bWw+")).toThrow(
      "Conteúdo",
    );
    expect(() => publicImage("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
  });
});

import { readdirSync, readFileSync } from "node:fs";
describe("Cadastro e recuperação", () => {
  it("cadastro exige verificação, token é de uso único e recuperação invalida sessões", async () => {
    const email = "teste-" + id() + "@example.com";
    const created = await request("auth/register", {
      name: "Conta de teste",
      email,
      password: "SenhaNova123!",
    });
    expect(created.status).toBe(200);
    const [u] = await query<User>("SELECT * FROM users WHERE email=$1", [
      email,
    ]);
    expect(u.verified).toBe(false);
    const first = readdirSync(process.env.MAIL_OUTBOX_DIR!).find((f) =>
      f.includes(u.id),
    )!;
    const verify = new URL(
      readFileSync(resolve(process.env.MAIL_OUTBOX_DIR!, first), "utf8")
        .split("Verifique seu e-mail: ")[1]
        .split("\n")[0],
    ).searchParams.get("verify");
    expect(
      (await request("auth/token", { kind: "verify", token: verify })).status,
    ).toBe(200);
    expect(
      (await request("auth/token", { kind: "verify", token: verify })).status,
    ).toBe(400);
    const session = await login(email, "SenhaNova123!");
    await request("auth/recover", { email });
    const files = readdirSync(process.env.MAIL_OUTBOX_DIR!).filter((f) =>
      f.includes(u.id),
    );
    const mail = files
      .map((f) =>
        readFileSync(resolve(process.env.MAIL_OUTBOX_DIR!, f), "utf8"),
      )
      .find((s) => s.includes("Redefina"))!;
    const token = new URL(
      mail.split("Redefina sua senha: ")[1].split("\n")[0],
    ).searchParams.get("reset");
    expect(
      (
        await request("auth/token", {
          kind: "reset",
          token,
          password: "OutraSenha456!",
        })
      ).status,
    ).toBe(200);
    expect(await currentUser(session)).toBeNull();
    await expect(login(email, "SenhaNova123!")).rejects.toThrow();
    expect(await login(email, "OutraSenha456!")).toBeTruthy();
  });
});

import { seedRealCatalog } from "../src/lib/demo-catalog";
describe("Catálogo real e atualização da demonstração", () => {
  it("busca por código e filtra idioma, acabamento e raridade", async () => {
    const res = await request(
      "catalog?q=OP01-025&language=Ingl%C3%AAs&rarity=SR",
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Roronoa Zoro");
    expect(data[0].code).toBe("OP01-025");
    const empty = await request("catalog?language=Portugu%C3%AAs");
    expect(await empty.json()).toHaveLength(0);
  });
  it("arquiva exemplos inventados e preserva snapshots dos pedidos pagos", async () => {
    const order = await paid();
    const [item] = await query("SELECT * FROM order_items WHERE order_id=$1", [
      order.id,
    ]);
    await query(
      "INSERT INTO cards(id,franchise,name,product_type) VALUES('aurora','Pokémon','Exemplo antigo','Carta avulsa')",
    );
    await query(
      "INSERT INTO editions VALUES('legacy-edition','aurora','Antiga','NX-001','Rara','Português','Holo','/art/aurora.svg')",
    );
    await query(
      "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,price,stock) VALUES('legacy-listing','demo-seller','legacy-edition','Exemplo antigo','Exemplo arquivado','NM',1000,1)",
    );
    await query("DELETE FROM audit WHERE action='demo.catalog.real.v1'");
    await transaction(seedRealCatalog);
    expect(
      (await query("SELECT archived FROM cards WHERE id='aurora'"))[0].archived,
    ).toBe(true);
    expect(
      (await query("SELECT status FROM listings WHERE id='legacy-listing'"))[0]
        .status,
    ).toBe("closed");
    expect(
      (
        await query("SELECT snapshot FROM order_items WHERE id=$1", [item.id])
      )[0].snapshot,
    ).toEqual(item.snapshot);
    const data = await (await request("catalog")).json();
    expect(data.some((r: any) => r.title === "Exemplo antigo")).toBe(false);
    expect(data.some((r: any) => r.title === "Charizard")).toBe(true);
    const before = await query("SELECT id FROM listings");
    await transaction(seedRealCatalog);
    expect((await query("SELECT id FROM listings")).length).toBe(before.length);
  });
});
