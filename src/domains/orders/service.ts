import { transaction, rows, type DB } from "../../lib/db";
import {
  check,
  id,
  commission,
  reversedCommission,
  audit,
  notify,
  hash,
} from "../../lib/core";
import { requireUser, type User } from "../users/auth";
import { draw, estimate } from "../boosters/rules";
export type CartItem = {
  listingId?: string;
  campaignId?: string;
  quantity: number;
  version?: number;
  expectedPrice?: number;
  stockToken?: string;
};
async function releaseOrder(db: DB, orderId: string) {
  for (const item of await rows(
    db,
    "SELECT * FROM order_items WHERE order_id=$1",
    [orderId],
  ))
    if (item.listing_id)
      await db.query("UPDATE listings SET stock=stock+$1 WHERE id=$2", [
        item.quantity,
        item.listing_id,
      ]);
  await db.query(
    "UPDATE physical_cards SET state='available',reserved_order=NULL WHERE reserved_order=$1 AND state='reserved'",
    [orderId],
  );
}
export async function expireReservations(db: DB) {
  const orders = await rows(
    db,
    "SELECT * FROM orders WHERE status='pending' AND expires_at<=now() FOR UPDATE",
  );
  for (const o of orders) {
    await releaseOrder(db, o.id);
    await db.query("UPDATE orders SET status='expired' WHERE id=$1", [o.id]);
    await db.query("UPDATE suborders SET status='expired' WHERE order_id=$1", [
      o.id,
    ]);
    await audit(db, null, "reservation.expired", o.id);
  }
}
export async function checkout(
  user: User | null,
  items: CartItem[],
  key: string,
  addressId: string,
  method: string,
) {
  requireUser(user);
  check(user.verified, "Verifique seu e-mail antes da compra");
  check(["pix", "card"].includes(method), "Forma de pagamento inválida");
  check(items.length > 0 && items.length <= 30, "Carrinho inválido");
  check(key.length >= 8 && key.length <= 100, "Chave de idempotência inválida");
  return transaction(async (db) => {
    await db.query("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE", [
      user.id,
    ]);
    const requestHash = hash(JSON.stringify({ items, addressId, method }));
    const [existing] = await rows(
      db,
      "SELECT * FROM orders WHERE buyer_id=$1 AND idempotency_key=$2",
      [user.id, key],
    );
    if (existing) {
      check(
        existing.request_hash === requestHash,
        "Chave já utilizada com outro carrinho",
        409,
      );
      return existing;
    }
    await expireReservations(db);
    const [address] = await rows(
      db,
      "SELECT data FROM addresses WHERE id=$1 AND user_id=$2",
      [addressId, user.id],
    );
    check(address, "Cadastre e selecione um endereço");
    const oid = id();
    const prepared: any[] = [];
    const seen = new Set<string>();
    for (const item of [...items].sort((a, b) =>
      (a.listingId || a.campaignId || "").localeCompare(
        b.listingId || b.campaignId || "",
      ),
    )) {
      check(
        Number.isInteger(item.quantity) &&
          item.quantity > 0 &&
          item.quantity <= 20,
        "Quantidade inválida",
      );
      check(
        Boolean(item.listingId) !== Boolean(item.campaignId),
        "Ofertas externas não entram no checkout",
      );
      const ident = item.listingId || item.campaignId!;
      check(!seen.has(ident), "Item duplicado");
      seen.add(ident);
      if (item.listingId) {
        const [l] = await rows(
          db,
          "SELECT l.*,u.suspended,e.collection,e.code,e.rarity,e.language,e.finish,c.franchise,c.product_type FROM listings l JOIN users u ON u.id=l.seller_id JOIN editions e ON e.id=l.edition_id JOIN cards c ON c.id=e.card_id WHERE l.id=$1 FOR UPDATE OF l",
          [item.listingId],
        );
        check(
          l && l.status === "active" && !l.suspended,
          "Anúncio indisponível",
          409,
        );
        check(
          l.seller_id !== user.id,
          "Você não pode comprar seu próprio anúncio",
        );
        check(l.stock >= item.quantity, "Estoque insuficiente", 409);
        check(
          item.expectedPrice === undefined || item.expectedPrice === l.price,
          "Preço atualizado. Revise o anúncio e adicione novamente ao carrinho.",
          409,
        );
        await db.query("UPDATE listings SET stock=stock-$1 WHERE id=$2", [
          item.quantity,
          l.id,
        ]);
        prepared.push({
          ...item,
          seller: l.seller_id,
          price: l.price,
          snapshot: {
            title: l.title,
            condition: l.condition,
            grading: l.grading,
            photos: l.photos,
            editionId: l.edition_id,
            collection: l.collection,
            code: l.code,
            rarity: l.rarity,
            language: l.language,
            finish: l.finish,
            franchise: l.franchise,
            productType: l.product_type,
            demo: l.demo,
          },
        });
      } else {
        check(
          process.env.APP_MODE !== "production",
          "Venda real de boosters bloqueada",
          403,
        );
        const [c] = await rows(
          db,
          "SELECT c.*,u.suspended FROM campaigns c JOIN users u ON u.id=c.seller_id WHERE c.id=$1 FOR UPDATE OF c",
          [item.campaignId],
        );
        check(
          c && c.status === "active" && !c.suspended,
          "Campanha indisponível",
          409,
        );
        check(
          c.seller_id !== user.id,
          "Você não pode comprar sua própria campanha",
        );
        check(
          item.version === c.version,
          "Composição atualizada. Revise antes de comprar.",
          409,
        );
        const stock = await rows(
          db,
          "SELECT p.*,e.art,e.collection,e.code,e.rarity,e.language,e.finish,c.name FROM physical_cards p JOIN editions e ON e.id=p.edition_id JOIN cards c ON c.id=e.card_id WHERE campaign_id=$1 AND state='available' ORDER BY p.id FOR UPDATE OF p",
          [c.id],
        );
        check(
          item.expectedPrice === undefined || item.expectedPrice === c.price,
          "Preço do booster atualizado. Revise antes de comprar.",
          409,
        );
        check(
          item.stockToken === undefined ||
            item.stockToken ===
              hash(
                stock
                  .map((p) => p.id)
                  .sort()
                  .join(","),
              ),
          "Estoque e probabilidades atualizados. Revise o booster antes de comprar.",
          409,
        );
        const selected: any[] = [];
        for (let i = 0; i < item.quantity; i++) {
          const picked = draw(
            c.rules,
            (stock as any[]).filter(
              (p) => !selected.some((s) => s.id === p.id),
            ),
          );
          selected.push(...picked);
        }
        for (const card of selected)
          await db.query(
            "UPDATE physical_cards SET state='reserved',reserved_order=$1 WHERE id=$2",
            [oid, card.id],
          );
        prepared.push({
          ...item,
          seller: c.seller_id,
          price: c.price,
          selected,
          snapshot: {
            title: c.title,
            rules: c.rules,
            version: c.version,
            stockToken: hash(
              stock
                .map((p) => p.id)
                .sort()
                .join(","),
            ),
            probabilities: c.rules.map(
              (r: { group: string; count: number }) => ({
                group: r.group,
                guaranteed: r.count,
                available: stock.filter((p) => p.group_name === r.group).length,
                perUnitNumerator: r.count,
                perUnitDenominator: stock.filter(
                  (p) => p.group_name === r.group,
                ).length,
              }),
            ),
            referenceExpected: estimate(c.rules, stock as any),
            referenceEvidence: stock
              .filter((p) => p.reference_value !== null)
              .map((p) => ({
                physicalId: p.id,
                value: p.reference_value,
                source: p.reference_source,
                date: p.reference_date,
              })),
            demo: true,
          },
        });
      }
    }
    const subtotal = prepared.reduce((s, i) => s + i.price * i.quantity, 0);
    check(
      Number.isSafeInteger(subtotal) && subtotal <= 10_000_000,
      "Limite do pedido excedido",
    );
    const sellers = [...new Set(prepared.map((i) => i.seller))];
    const shipping = sellers.length * 1500;
    const fee = prepared.reduce(
      (s, i) => s + commission(i.price * i.quantity),
      0,
    );
    const [order] = await rows(
      db,
      "INSERT INTO orders(id,buyer_id,subtotal,shipping,total,commission,expires_at,idempotency_key,address_snapshot,request_hash) VALUES($1,$2,$3,$4,$5,$6,now()+interval '15 minutes',$7,$8,$9) RETURNING *",
      [
        oid,
        user.id,
        subtotal,
        shipping,
        subtotal + shipping,
        fee,
        key,
        JSON.stringify(address.data),
        requestHash,
      ],
    );
    for (const seller of sellers) {
      const sid = id();
      const lines = prepared.filter((i) => i.seller === seller);
      await db.query(
        "INSERT INTO suborders(id,order_id,seller_id,subtotal,shipping,commission) VALUES($1,$2,$3,$4,$5,$6)",
        [
          sid,
          oid,
          seller,
          lines.reduce((s, i) => s + i.price * i.quantity, 0),
          1500,
          lines.reduce((s, i) => s + commission(i.price * i.quantity), 0),
        ],
      );
      for (const item of lines) {
        const iid = id();
        await db.query(
          "INSERT INTO order_items(id,order_id,suborder_id,listing_id,campaign_id,quantity,unit_price,subtotal,commission,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            iid,
            oid,
            sid,
            item.listingId || null,
            item.campaignId || null,
            item.quantity,
            item.price,
            item.price * item.quantity,
            commission(item.price * item.quantity),
            JSON.stringify(item.snapshot),
          ],
        );
        for (const card of item.selected || [])
          await db.query(
            "INSERT INTO booster_results(id,order_id,item_id,physical_id,snapshot) VALUES($1,$2,$3,$4,$5)",
            [
              id(),
              oid,
              iid,
              card.id,
              JSON.stringify({ ...card, reserved_order: undefined }),
            ],
          );
      }
    }
    await db.query(
      "INSERT INTO payments(id,order_id,provider,method,status,amount) VALUES($1,$2,'sandbox',$3,'pending',$4)",
      [id(), oid, method, order.total],
    );
    await audit(db, user.id, "order.reserved", oid, {
      subtotal,
      shipping,
      commission: fee,
    });
    return order;
  });
}
export async function paymentEvent(
  event: {
    eventId: string;
    orderId: string;
    amount: number;
    status: "approved" | "failed";
  },
  payloadHash = hash(JSON.stringify(event)),
) {
  return transaction(async (db) => {
    const inserted = await rows(
      db,
      "INSERT INTO webhook_events(provider,event_id,payload_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *",
      ["sandbox", event.eventId, payloadHash],
    );
    if (!inserted.length) {
      const [previous] = await rows(
        db,
        "SELECT payload_hash FROM webhook_events WHERE provider=$1 AND event_id=$2",
        ["sandbox", event.eventId],
      );
      check(
        previous.payload_hash === payloadHash,
        "Evento repetido com conteúdo diferente",
        409,
      );
      return { duplicate: true };
    }
    const [o] = await rows(db, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
      event.orderId,
    ]);
    check(o, "Pedido não encontrado", 404);
    check(event.amount === o.total, "Valor do pagamento divergente", 409);
    if (
      ["paid", "partially_refunded", "refunded", "late_payment"].includes(
        o.status,
      )
    )
      return { duplicate: true };
    if (
      o.status === "pending" &&
      new Date(o.expires_at).getTime() <= Date.now()
    ) {
      await releaseOrder(db, o.id);
      await db.query("UPDATE orders SET status='expired' WHERE id=$1", [o.id]);
      o.status = "expired";
    }
    if (event.status === "failed") {
      if (o.status === "pending") await releaseOrder(db, o.id);
      await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
        o.id,
      ]);
      await db.query("UPDATE payments SET status='failed' WHERE order_id=$1", [
        o.id,
      ]);
      await db.query(
        "UPDATE suborders SET status='cancelled' WHERE order_id=$1",
        [o.id],
      );
      return { status: "cancelled" };
    }
    if (o.status !== "pending") {
      await db.query(
        "UPDATE orders SET status='late_payment',refunded=total WHERE id=$1",
        [o.id],
      );
      await db.query(
        "UPDATE payments SET status='refunded' WHERE order_id=$1",
        [o.id],
      );
      await db.query(
        "UPDATE suborders SET status='refunded' WHERE order_id=$1",
        [o.id],
      );
      await audit(db, null, "sandbox.late_payment_refunded", o.id, {
        amount: o.total,
      });
      await notify(
        db,
        o.buyer_id,
        "Pagamento tardio: estorno integral simulado. Nenhum estoque foi atribuído.",
      );
      return { status: "late_payment" };
    }
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [o.id]);
    await db.query("UPDATE suborders SET status='paid' WHERE order_id=$1", [
      o.id,
    ]);
    await db.query("UPDATE payments SET status='approved' WHERE order_id=$1", [
      o.id,
    ]);
    await db.query(
      "UPDATE physical_cards SET state='sold' WHERE reserved_order=$1 AND state='reserved'",
      [o.id],
    );
    await audit(db, null, "payment.approved", o.id);
    await notify(
      db,
      o.buyer_id,
      "Pagamento sandbox confirmado. Seu pedido está em separação.",
    );
    for (const s of await rows(
      db,
      "SELECT seller_id FROM suborders WHERE order_id=$1",
      [o.id],
    ))
      await notify(
        db,
        s.seller_id,
        "Você recebeu um pedido sandbox. Confira as unidades para envio.",
      );
    return { status: "paid" };
  });
}
export async function refund(
  user: User | null,
  itemId: string,
  amount: number,
  key: string,
) {
  requireUser(user, ["admin"]);
  check(Number.isInteger(amount) && amount > 0, "Reembolso inválido");
  return transaction(async (db) => {
    const [old] = await rows(
      db,
      "SELECT * FROM refunds WHERE idempotency_key=$1",
      [key],
    );
    if (old) {
      check(
        old.item_id === itemId && old.amount === amount,
        "Chave já utilizada em outro reembolso",
        409,
      );
      return old;
    }
    const [i] = await rows(
      db,
      "SELECT * FROM order_items WHERE id=$1 FOR UPDATE",
      [itemId],
    );
    check(i, "Item não encontrado", 404);
    const [o] = await rows(db, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
      i.order_id,
    ]);
    check(
      ["paid", "partially_refunded"].includes(o.status),
      "Pedido não reembolsável",
    );
    check(
      i.refunded + amount <= i.subtotal,
      "Reembolso excede o valor do item",
    );
    const reversal =
      reversedCommission(i.commission, i.refunded + amount, i.subtotal) -
      i.commission_reversed;
    const [r] = await rows(
      db,
      "INSERT INTO refunds(id,order_id,item_id,amount,commission_reversed,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [id(), o.id, i.id, amount, reversal, key],
    );
    await db.query(
      "UPDATE order_items SET refunded=refunded+$1,commission_reversed=commission_reversed+$2 WHERE id=$3",
      [amount, reversal, i.id],
    );
    await db.query(
      "UPDATE orders SET refunded=refunded+$1,status=CASE WHEN refunded+$1=total THEN 'refunded' ELSE 'partially_refunded' END WHERE id=$2",
      [amount, o.id],
    );
    await audit(db, user.id, "sandbox.refund", o.id, r);
    await notify(
      db,
      o.buyer_id,
      "Reembolso de produto registrado no sandbox. Frete é contabilizado separadamente.",
    );
    return r;
  });
}
export async function orderAccess(db: DB, user: User | null, orderId: string) {
  requireUser(user);
  const [o] = await rows(db, "SELECT * FROM orders WHERE id=$1", [orderId]);
  check(o, "Pedido não encontrado", 404);
  check(
    o.buyer_id === user.id ||
      user.role === "admin" ||
      (
        await rows(
          db,
          "SELECT id FROM suborders WHERE order_id=$1 AND seller_id=$2",
          [orderId, user.id],
        )
      ).length,
    "Sem acesso ao pedido",
    403,
  );
  return o;
}

export async function refundShipping(
  user: User | null,
  suborderId: string,
  amount: number,
  key: string,
) {
  requireUser(user, ["admin"]);
  check(Number.isInteger(amount) && amount > 0, "Valor inválido");
  return transaction(async (db) => {
    const [old] = await rows(
      db,
      "SELECT * FROM refunds WHERE idempotency_key=$1",
      [key],
    );
    if (old) {
      check(
        old.amount === amount && old.suborder_id === suborderId,
        "Chave reutilizada",
        409,
      );
      return old;
    }
    const [s] = await rows(
      db,
      "SELECT * FROM suborders WHERE id=$1 FOR UPDATE",
      [suborderId],
    );
    check(s, "Remessa não encontrada", 404);
    const [o] = await rows(db, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
      s.order_id,
    ]);
    check(
      ["paid", "partially_refunded"].includes(o.status),
      "Pedido não reembolsável",
    );
    check(s.shipping_refunded + amount <= s.shipping, "Estorno excede o frete");
    const [r] = await rows(
      db,
      "INSERT INTO refunds(id,order_id,item_id,amount,commission_reversed,idempotency_key,suborder_id) VALUES($1,$2,NULL,$3,0,$4,$5) RETURNING *",
      [id(), o.id, amount, key, s.id],
    );
    await db.query(
      "UPDATE suborders SET shipping_refunded=shipping_refunded+$1 WHERE id=$2",
      [amount, s.id],
    );
    await db.query(
      "UPDATE orders SET refunded=refunded+$1,status=CASE WHEN refunded+$1=total THEN 'refunded' ELSE 'partially_refunded' END WHERE id=$2",
      [amount, o.id],
    );
    await audit(db, user.id, "sandbox.shipping_refund", s.id, r);
    return r;
  });
}
