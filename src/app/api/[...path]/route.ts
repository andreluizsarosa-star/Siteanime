import { metrics, reconcile } from "@/domains/admin/service";
import { comparableOffers } from "@/domains/catalog/service";
import { listingPhotos } from "@/domains/listings/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash as passwordHash } from "bcryptjs";
import { query, rows, transaction } from "@/lib/db";
import {
  check,
  AppError,
  id,
  hash,
  audit,
  publicImage,
  commission,
  notify,
} from "@/lib/core";
import {
  currentUser,
  requireUser,
  login,
  register,
  type User,
} from "@/domains/users/auth";
import { sendToken } from "@/domains/users/mail";
import {
  checkout,
  paymentEvent,
  refund,
  refundShipping,
  expireReservations,
  orderAccess,
} from "@/domains/orders/service";
import { requireSandbox, verifyWebhook } from "@/domains/payments/provider";
import { affiliateURL } from "@/domains/affiliates/service";
import { capacity, estimate } from "@/domains/boosters/rules";
export const runtime = "nodejs";
const str = z.string().trim().min(1).max(300);
const uuid = z.string().min(1).max(100);
const integer = z.number().int().nonnegative().max(10_000_000);
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await ctx.params).path.join("/");
    const method = req.method;
    const user = await currentUser(req.cookies.get("nexo_session")?.value);
    const production = process.env.APP_MODE === "production";
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin)
        check(
          (new URL(origin).host === req.headers.get("host") &&
            ["http:", "https:"].includes(new URL(origin).protocol)) ||
            origin === process.env.APP_URL,
          "Origem inválida",
          403,
        );
      if (path !== "payments/webhook")
        check(
          req.headers.get("content-type")?.includes("application/json"),
          "Envie JSON",
          415,
        );
      check(
        Number(req.headers.get("content-length") || 0) <= 8_000_000,
        "Requisição muito grande",
        413,
      );
    }
    const raw = method === "GET" ? "" : await req.text();
    check(raw.length < 8_000_000, "Requisição muito grande", 413);
    let body: any = {};
    if (raw && path !== "payments/webhook") {
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AppError(400, "JSON inválido");
      }
    }
    async function limited(scope: string, max = 15) {
      await transaction(async (db) => {
        const key =
          scope +
          ":" +
          hash(user?.id || req.headers.get("x-forwarded-for") || "local");
        await db.query("DELETE FROM rate_limits WHERE expires_at<now()");
        const [r] = await rows(
          db,
          "INSERT INTO rate_limits VALUES($1,1,now()+interval '10 minutes') ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
          [key],
        );
        check(r.count <= max, "Muitas tentativas. Aguarde dez minutos.", 429);
      });
    }
    if (path === "session" && method === "GET")
      return json({
        user,
        mode: production ? "production" : "demo",
        siteName: process.env.NEXT_PUBLIC_SITE_NAME || "Nexo TCG",
      });
    if (path === "auth/login" && method === "POST") {
      await limited("login");
      const b = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(body);
      const token = await login(b.email, b.password);
      const response = json({ ok: true });
      response.cookies.set("nexo_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure:
          production ||
          process.env.COOKIE_SECURE === "true" ||
          Boolean(process.env.APP_URL?.startsWith("https://")),
        path: "/",
        maxAge: 604800,
      });
      return response;
    }
    if (path === "auth/logout" && method === "POST") {
      if (req.cookies.get("nexo_session"))
        await query("DELETE FROM sessions WHERE token_hash=$1", [
          hash(req.cookies.get("nexo_session")!.value),
        ]);
      const r = json({ ok: true });
      r.cookies.delete("nexo_session");
      return r;
    }
    if (path === "auth/register" && method === "POST") {
      await limited("register", 5);
      const b = z
        .object({
          name: str,
          email: z.email(),
          password: z.string().min(10).max(200),
        })
        .parse(body);
      if (production)
        check(
          process.env.SMTP_URL,
          "Entrega de e-mail ainda não configurada",
          503,
        );
      const uid = await register(b.name, b.email, b.password);
      await sendToken(uid, b.email, "verify");
      return json({
        message:
          "Cadastro criado. Confira seu e-mail. Em demonstração, a mensagem está em .data/outbox.",
      });
    }
    if (path === "auth/resend" && method === "POST") {
      requireUser(user);
      await limited("resend", 3);
      if (!user.verified) await sendToken(user.id, user.email, "verify");
      return json({
        message: "Verificação enviada. No demo, consulte .data/outbox.",
      });
    }
    if (path === "auth/recover" && method === "POST") {
      await limited("recovery", 5);
      const b = z.object({ email: z.email() }).parse(body);
      const [u] = await query("SELECT id,email FROM users WHERE email=$1", [
        b.email.toLowerCase(),
      ]);
      if (u) await sendToken(u.id, u.email, "reset");
      return json({
        message: "Se o e-mail estiver cadastrado, enviaremos as instruções.",
      });
    }
    if (path === "auth/token" && method === "POST") {
      await limited("token");
      const b = z
        .object({
          token: z.string().length(64),
          kind: z.enum(["verify", "reset"]),
          password: z.string().min(10).max(200).optional(),
        })
        .parse(body);
      await transaction(async (db) => {
        const [t] = await rows(
          db,
          "DELETE FROM auth_tokens WHERE token_hash=$1 AND kind=$2 AND expires_at>now() RETURNING *",
          [hash(b.token), b.kind],
        );
        check(t, "Link expirado ou já utilizado");
        if (b.kind === "verify")
          await db.query("UPDATE users SET verified=true WHERE id=$1", [
            t.user_id,
          ]);
        else {
          check(b.password, "Informe uma nova senha");
          await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
            await passwordHash(b.password, 12),
            t.user_id,
          ]);
          await db.query("DELETE FROM sessions WHERE user_id=$1", [t.user_id]);
        }
        await audit(db, t.user_id, "auth." + b.kind, t.user_id);
      });
      return json({ message: "Conta atualizada. Você já pode entrar." });
    }
    if (path === "catalog" && method === "GET") {
      const p = req.nextUrl.searchParams;
      const filter = p.get("q") || "";
      const franchise = p.get("franchise") || "";
      const type = p.get("type") || "";
      const condition = p.get("condition") || "";
      const sorting: Record<string, string> = {
        recent: "l.created_at DESC",
        price: "l.price ASC",
        expensive: "l.price DESC",
      };
      const sort = sorting[p.get("sort") || "recent"] || sorting.recent;
      return json(
        await query(
          `SELECT l.*,e.collection,e.code,e.rarity,e.language,e.finish,e.art,c.franchise,c.product_type,u.name seller_name FROM listings l JOIN editions e ON e.id=l.edition_id JOIN cards c ON c.id=e.card_id JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND NOT u.suspended AND ($1='' OR l.title ILIKE '%'||$1||'%' OR e.collection ILIKE '%'||$1||'%') AND ($2='' OR c.franchise=$2) AND ($3='' OR c.product_type=$3) AND ($4='' OR l.condition=$4) ORDER BY ${sort} LIMIT 100`,
          [filter, franchise, type, condition],
        ),
      );
    }
    if (path.startsWith("product/") && method === "GET") {
      const lid = path.slice(8);
      const [l] = await query(
        "SELECT l.*,e.*,l.id id,c.franchise,c.name,c.product_type,u.name seller_name FROM listings l JOIN editions e ON e.id=l.edition_id JOIN cards c ON c.id=e.card_id JOIN users u ON u.id=l.seller_id WHERE l.id=$1 AND l.status=$2 AND NOT u.suspended",
        [lid, "active"],
      );
      check(l, "Anúncio não encontrado", 404);
      return json({
        listing: l,
        offers: await comparableOffers(l.edition_id, l.condition, l.grading),
      });
    }
    if (path.startsWith("seller/") && method === "GET") {
      const sid = path.slice(7);
      const [seller] = await query(
        "SELECT id,name,bio,avatar,created_at FROM users WHERE id=$1 AND NOT suspended",
        [sid],
      );
      check(seller, "Vendedor não encontrado", 404);
      return json({
        seller,
        reviews: await query(
          "SELECT r.rating,r.body,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.buyer_id WHERE seller_id=$1",
          [sid],
        ),
        listings: await query(
          "SELECT l.*,e.art,c.franchise,u.name seller_name FROM listings l JOIN editions e ON e.id=l.edition_id JOIN cards c ON c.id=e.card_id JOIN users u ON u.id=l.seller_id WHERE seller_id=$1 AND status='active'",
          [sid],
        ),
      });
    }
    if (path === "favorites") {
      requireUser(user);
      if (method === "POST") {
        const b = z.object({ listingId: uuid }).parse(body);
        await transaction(async (db) => {
          const exists = await rows(
            db,
            "DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2 RETURNING *",
            [user.id, b.listingId],
          );
          if (!exists.length)
            await db.query("INSERT INTO favorites VALUES($1,$2)", [
              user.id,
              b.listingId,
            ]);
        });
        return json({ ok: true });
      }
      return json(
        await query(
          "SELECT l.*,e.art,c.franchise,u.name seller_name FROM favorites f JOIN listings l ON l.id=f.listing_id JOIN editions e ON e.id=l.edition_id JOIN cards c ON c.id=e.card_id JOIN users u ON u.id=l.seller_id WHERE f.user_id=$1",
          [user.id],
        ),
      );
    }
    if (path === "account") {
      requireUser(user);
      if (method === "PATCH") {
        const b = z
          .object({
            name: str,
            bio: z.string().max(1000),
            avatar: z.string().optional(),
          })
          .parse(body);
        if (b.avatar) publicImage(b.avatar);
        await query(
          "UPDATE users SET name=$1,bio=$2,avatar=COALESCE($3,avatar) WHERE id=$4",
          [b.name, b.bio, b.avatar || null, user.id],
        );
        return json({ ok: true });
      }
      return json({
        profile: (
          await query("SELECT name,bio,avatar FROM users WHERE id=$1", [
            user.id,
          ])
        )[0],
        addresses: await query("SELECT * FROM addresses WHERE user_id=$1", [
          user.id,
        ]),
        notifications: await query(
          "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
          [user.id],
        ),
      });
    }
    if (path === "notifications/read" && method === "POST") {
      requireUser(user);
      await query("UPDATE notifications SET read=true WHERE user_id=$1", [
        user.id,
      ]);
      return json({ ok: true });
    }
    if (path === "addresses" && method === "POST") {
      requireUser(user);
      const b = z
        .object({
          label: str,
          recipient: str,
          street: str,
          number: str,
          city: str,
          state: z.string().length(2),
          zip: z.string().regex(/^\d{8}$/),
        })
        .parse(body);
      const aid = id();
      await query("INSERT INTO addresses VALUES($1,$2,$3,$4)", [
        aid,
        user.id,
        b.label,
        JSON.stringify(b),
      ]);
      return json({ id: aid });
    }
    if (path === "seller/activate" && method === "POST") {
      requireUser(user);
      check(
        !production,
        "Onboarding real de recebedores ainda indisponível",
        503,
      );
      const b = z
        .object({
          legalName: str,
          document: z.string().regex(/^\d{11}(\d{3})?$/),
        })
        .parse(body);
      await transaction(async (db) => {
        await db.query(
          "INSERT INTO seller_private(user_id,legal_name,document) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET legal_name=$2,document=$3",
          [user.id, b.legalName, b.document],
        );
        await db.query(
          "UPDATE users SET role='seller' WHERE id=$1 AND role='user'",
          [user.id],
        );
        await audit(db, user.id, "seller.sandbox_activated", user.id);
      });
      return json({ ok: true });
    }
    if (path === "editions" && method === "GET")
      return json(
        await query(
          "SELECT e.*,c.name,c.franchise,c.product_type FROM editions e JOIN cards c ON c.id=e.card_id ORDER BY c.name",
        ),
      );
    if (path === "listings") {
      requireUser(user, ["seller", "admin"]);
      if (method === "GET")
        return json(
          await query(
            "SELECT l.*,e.art FROM listings l JOIN editions e ON e.id=l.edition_id WHERE seller_id=$1 ORDER BY created_at DESC",
            [user.id],
          ),
        );
      if (method === "POST" || method === "PATCH") {
        const b = z
          .object({
            id: uuid.optional(),
            editionId: uuid,
            title: str,
            description: z.string().min(10).max(3000),
            condition: z.enum(["NM", "LP", "MP", "HP", "DMG", "Novo", "Usado"]),
            grading: z.string().max(200).optional(),
            price: integer.positive(),
            stock: z.number().int().min(0).max(10000),
            status: z.enum(["active", "paused", "closed"]),
            photos: z.array(z.string()).min(1).max(5),
          })
          .parse(body);
        listingPhotos(b.photos);
        const lid = b.id || id();
        await transaction(async (db) => {
          if (b.id) {
            const [l] = await rows(
              db,
              "SELECT * FROM listings WHERE id=$1 FOR UPDATE",
              [b.id],
            );
            check(
              l && (l.seller_id === user.id || user.role === "admin"),
              "Sem permissão",
              403,
            );
            check(
              !(
                await rows(
                  db,
                  "SELECT i.id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.listing_id=$1 AND o.status='pending'",
                  [b.id],
                )
              ).length,
              "Aguarde as reservas pendentes antes de alterar o estoque",
              409,
            );
            await db.query(
              "UPDATE listings SET edition_id=$1,title=$2,description=$3,condition=$4,grading=$5,price=$6,stock=$7,status=$8,photos=$9 WHERE id=$10",
              [
                b.editionId,
                b.title,
                b.description,
                b.condition,
                b.grading || null,
                b.price,
                b.stock,
                b.status,
                JSON.stringify(b.photos),
                lid,
              ],
            );
          } else
            await db.query(
              "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,grading,price,stock,status,photos,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
              [
                lid,
                user.id,
                b.editionId,
                b.title,
                b.description,
                b.condition,
                b.grading || null,
                b.price,
                b.stock,
                production ? "pending" : b.status,
                JSON.stringify(b.photos),
                !production,
              ],
            );
          await audit(db, user.id, "listing.saved", lid);
        });
        return json({ id: lid });
      }
    }
    if (path === "checkout" && method === "POST") {
      requireSandbox();
      await limited("checkout", 30);
      const b = z
        .object({
          items: z.array(
            z
              .object({
                listingId: uuid.optional(),
                campaignId: uuid.optional(),
                quantity: z.number().int().positive(),
                version: z.number().int().optional(),
                expectedPrice: integer.positive(),
                stockToken: z.string().optional(),
              })
              .refine(
                (i) => !i.campaignId || Boolean(i.stockToken),
                "Revise o booster para atualizar as probabilidades",
              ),
          ),
          key: uuid,
          addressId: uuid,
          method: z.enum(["pix", "card"]),
        })
        .parse(body);
      return json(await checkout(user, b.items, b.key, b.addressId, b.method));
    }
    if (path === "orders" && method === "GET") {
      requireUser(user);
      await transaction(expireReservations);
      return json(
        await query(
          "SELECT DISTINCT o.*,CASE WHEN o.buyer_id=$1 THEN 'buyer' ELSE 'seller' END perspective FROM orders o LEFT JOIN suborders s ON s.order_id=o.id WHERE o.buyer_id=$1 OR s.seller_id=$1 ORDER BY o.created_at DESC",
          [user.id],
        ),
      );
    }
    if (path.startsWith("orders/") && method === "GET") {
      requireUser(user);
      const oid = path.slice(7);
      return json(
        await transaction(async (db) => {
          await expireReservations(db);
          const o = await orderAccess(db, user, oid);
          const full = o.buyer_id === user.id || user.role === "admin";
          const items = await rows(
            db,
            "SELECT i.*,s.seller_id,u.name seller_name,s.status shipment_status,s.tracking FROM order_items i JOIN suborders s ON s.id=i.suborder_id JOIN users u ON u.id=s.seller_id WHERE i.order_id=$1 AND ($2 OR s.seller_id=$3)",
            [oid, full, user.id],
          );
          return {
            order: o,
            items,
            suborders: await rows(
              db,
              "SELECT * FROM suborders WHERE order_id=$1 AND ($2 OR seller_id=$3)",
              [oid, full, user.id],
            ),
            messages: await rows(
              db,
              "SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.author_id WHERE order_id=$1 ORDER BY created_at",
              [oid],
            ),
            results: ["paid", "partially_refunded", "refunded"].includes(
              o.status,
            )
              ? await rows(
                  db,
                  "SELECT r.* FROM booster_results r JOIN order_items i ON i.id=r.item_id JOIN suborders s ON s.id=i.suborder_id WHERE r.order_id=$1 AND ($2 OR s.seller_id=$3) ORDER BY r.id",
                  [oid, full, user.id],
                )
              : [],
          };
        }),
      );
    }
    if (path === "payments/simulate" && method === "POST") {
      requireSandbox();
      requireUser(user);
      await limited("simulate", 30);
      const b = z
        .object({ orderId: uuid, status: z.enum(["approved", "failed"]) })
        .parse(body);
      const [o] = await query(
        "SELECT * FROM orders WHERE id=$1 AND buyer_id=$2",
        [b.orderId, user.id],
      );
      check(o, "Pedido não encontrado", 404);
      return json(
        await paymentEvent({
          eventId: "simulation-" + b.orderId + "-" + b.status,
          orderId: b.orderId,
          amount: o.total,
          status: b.status,
        }),
      );
    }
    if (path === "payments/webhook" && method === "POST") {
      requireSandbox();
      check(
        verifyWebhook(raw, req.headers.get("x-nexo-signature")),
        "Assinatura inválida",
        401,
      );
      const b = z
        .object({
          eventId: uuid,
          orderId: uuid,
          amount: integer,
          status: z.enum(["approved", "failed"]),
        })
        .parse(JSON.parse(raw));
      return json(await paymentEvent(b, hash(raw)));
    }
    if (path === "refunds/shipping" && method === "POST") {
      requireSandbox();
      const b = z
        .object({ suborderId: uuid, amount: integer.positive(), key: uuid })
        .parse(body);
      return json(await refundShipping(user, b.suborderId, b.amount, b.key));
    }
    if (path === "refunds" && method === "POST") {
      requireSandbox();
      const b = z
        .object({ itemId: uuid, amount: integer.positive(), key: uuid })
        .parse(body);
      return json(await refund(user, b.itemId, b.amount, b.key));
    }
    if (path === "shipments" && method === "POST") {
      requireUser(user, ["seller", "admin"]);
      const b = z
        .object({
          suborderId: uuid,
          tracking: str,
          status: z.enum(["preparing", "shipped"]),
        })
        .parse(body);
      await transaction(async (db) => {
        const [s] = await rows(
          db,
          "SELECT s.*,o.status payment_status FROM suborders s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE OF s",
          [b.suborderId],
        );
        check(
          s && (s.seller_id === user.id || user.role === "admin"),
          "Sem permissão",
          403,
        );
        check(
          ["paid", "partially_refunded"].includes(s.payment_status),
          "Pagamento não confirmado",
        );
        await db.query(
          "UPDATE suborders SET status=$1,tracking=$2 WHERE id=$3",
          [b.status, b.tracking, s.id],
        );
        await audit(db, user.id, "shipment.updated", s.id, b);
        const [o] = await rows(db, "SELECT buyer_id FROM orders WHERE id=$1", [
          s.order_id,
        ]);
        await notify(
          db,
          o.buyer_id,
          "Envio atualizado no pedido #" +
            s.order_id.slice(0, 8) +
            ": " +
            b.status,
        );
      });
      return json({ ok: true });
    }
    if (path === "delivery" && method === "POST") {
      requireUser(user);
      const b = z.object({ orderId: uuid }).parse(body);
      await transaction(async (db) => {
        const o = await orderAccess(db, user, b.orderId);
        check(
          o.buyer_id === user.id,
          "Somente o comprador pode confirmar entrega",
          403,
        );
        check(
          ["paid", "partially_refunded"].includes(o.status),
          "Pagamento não confirmado",
        );
        check(
          !(
            await rows(
              db,
              "SELECT id FROM suborders WHERE order_id=$1 AND status NOT IN ('shipped','delivered')",
              [o.id],
            )
          ).length,
          "Aguarde a postagem de todas as remessas",
        );
        await db.query(
          "UPDATE suborders SET status='delivered' WHERE order_id=$1",
          [o.id],
        );
        await audit(db, user.id, "order.delivered", o.id);
      });
      return json({ ok: true });
    }
    if (path === "messages" && method === "POST") {
      requireUser(user);
      await limited("message", 60);
      const b = z
        .object({ orderId: uuid, body: z.string().trim().min(1).max(2000) })
        .parse(body);
      await transaction(async (db) => {
        await orderAccess(db, user, b.orderId);
        await db.query(
          "INSERT INTO messages(id,order_id,author_id,body) VALUES($1,$2,$3,$4)",
          [id(), b.orderId, user.id, b.body],
        );
        for (const person of await rows(
          db,
          "SELECT buyer_id user_id FROM orders WHERE id=$1 UNION SELECT seller_id user_id FROM suborders WHERE order_id=$1",
          [b.orderId],
        ))
          if (person.user_id !== user.id)
            await notify(
              db,
              person.user_id,
              "Nova mensagem no pedido #" + b.orderId.slice(0, 8),
            );
      });
      return json({ ok: true });
    }
    if (path === "reviews" && method === "POST") {
      requireUser(user);
      const b = z
        .object({
          orderId: uuid,
          sellerId: uuid,
          rating: z.number().int().min(1).max(5),
          body: z.string().max(1000),
        })
        .parse(body);
      await transaction(async (db) => {
        const [o] = await rows(
          db,
          "SELECT o.* FROM orders o JOIN suborders s ON s.order_id=o.id WHERE o.id=$1 AND o.buyer_id=$2 AND s.seller_id=$3 AND s.status='delivered' AND o.status IN ('paid','partially_refunded')",
          [b.orderId, user.id, b.sellerId],
        );
        check(o, "Avaliação exige uma compra sua entregue", 403);
        await db.query(
          "INSERT INTO reviews(id,order_id,buyer_id,seller_id,rating,body) VALUES($1,$2,$3,$4,$5,$6)",
          [id(), o.id, user.id, b.sellerId, b.rating, b.body],
        );
      });
      return json({ ok: true });
    }
    if (path === "reports" && method === "POST") {
      requireUser(user);
      await limited("report", 10);
      const b = z
        .object({
          orderId: uuid.optional(),
          listingId: uuid.optional(),
          reason: z.string().min(10).max(2000),
          evidence: z.array(z.string()).max(4),
        })
        .parse(body);
      check(b.orderId || b.listingId, "Informe um pedido ou anúncio");
      b.evidence.forEach(publicImage);
      await transaction(async (db) => {
        if (b.orderId) await orderAccess(db, user, b.orderId);
        await db.query(
          "INSERT INTO disputes(id,order_id,listing_id,user_id,reason,evidence) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id(),
            b.orderId || null,
            b.listingId || null,
            user.id,
            b.reason,
            JSON.stringify(b.evidence),
          ],
        );
        await audit(db, user.id, "report.created", b.orderId || b.listingId!);
      });
      return json({ ok: true });
    }
    if (path === "affiliates" && method === "GET")
      return json(
        await query(
          "SELECT * FROM affiliates WHERE active ORDER BY updated_at DESC",
        ),
      );
    if (path === "affiliates/click" && method === "POST") {
      await limited("click", 60);
      const b = z.object({ id: uuid }).parse(body);
      const [a] = await query(
        "SELECT * FROM affiliates WHERE id=$1 AND active",
        [b.id],
      );
      check(a, "Oferta não encontrada", 404);
      const url = affiliateURL(a.url, a.platform);
      await query(
        "INSERT INTO affiliate_clicks(id,affiliate_id) VALUES($1,$2)",
        [id(), a.id],
      );
      return json({ url });
    }
    if (path === "boosters" && method === "GET") {
      await transaction(expireReservations);
      const result = await query(
        "SELECT c.*,u.name seller_name FROM campaigns c JOIN users u ON u.id=c.seller_id WHERE c.status='active' AND NOT u.suspended",
      );
      for (const c of result) {
        const stock = await query(
          "SELECT id,group_name,reference_value FROM physical_cards WHERE campaign_id=$1 AND state='available'",
          [c.id],
        );
        c.stockToken = hash(
          stock
            .map((p) => p.id)
            .sort()
            .join(","),
        );
        c.capacity = capacity(c.rules, stock as any);
        c.expected = estimate(c.rules, stock as any);
        c.groups = c.rules.map((r: any) => ({
          ...r,
          stock: stock.filter((s) => s.group_name === r.group).length,
        }));
      }
      return json(result);
    }
    if (path === "boosters/reveal" && method === "POST") {
      requireUser(user);
      const b = z
        .object({ resultId: uuid, all: z.boolean().optional() })
        .parse(body);
      await transaction(async (db) => {
        const [r] = await rows(
          db,
          "SELECT r.*,o.buyer_id,o.status FROM booster_results r JOIN orders o ON o.id=r.order_id WHERE r.id=$1",
          [b.resultId],
        );
        check(r && r.buyer_id === user.id, "Sem permissão", 403);
        check(
          ["paid", "partially_refunded", "refunded"].includes(r.status),
          "Pagamento não confirmado",
        );
        if (b.all)
          await db.query(
            "UPDATE booster_results SET revealed=true WHERE order_id=$1",
            [r.order_id],
          );
        else
          await db.query(
            "UPDATE booster_results SET revealed=true WHERE id=$1",
            [r.id],
          );
        await audit(db, user.id, "booster.revealed", r.order_id);
      });
      return json({ ok: true });
    }
    if (path === "campaigns") {
      requireUser(user, ["seller", "admin"]);
      if (method === "GET") {
        const campaigns = await query(
          "SELECT * FROM campaigns WHERE seller_id=$1",
          [user.id],
        );
        for (const c of campaigns)
          c.inventory = await query(
            "SELECT * FROM physical_cards WHERE campaign_id=$1",
            [c.id],
          );
        return json(campaigns);
      }
      if (method === "POST") {
        requireSandbox();
        const b = z
          .object({
            title: str,
            description: z.string().min(10).max(3000),
            price: integer.positive(),
            rules: z
              .array(
                z.object({
                  group: str,
                  count: z.number().int().min(1).max(20),
                }),
              )
              .min(1)
              .max(10),
            inventory: z
              .array(
                z.object({
                  editionId: uuid,
                  group: str,
                  quantity: z.number().int().min(1).max(100),
                  condition: str,
                  photo: z.string(),
                  declaredValue: integer,
                  referenceValue: integer.nullable(),
                  referenceSource: z.string().max(300).nullable(),
                  referenceDate: z
                    .string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)
                    .nullable(),
                }),
              )
              .min(1)
              .max(40),
            publish: z.boolean(),
          })
          .parse(body);
        const stock = b.inventory.flatMap((i) =>
          Array.from({ length: i.quantity }, () => ({
            group_name: i.group,
            reference_value: i.referenceValue,
          })),
        );
        const count = capacity(b.rules, stock);
        check(count > 0, "Estoque insuficiente para cumprir as garantias");
        for (const i of b.inventory) {
          publicImage(i.photo);
          if (i.referenceValue !== null)
            check(
              i.referenceSource && i.referenceDate,
              "Referência exige fonte e data",
            );
          check(
            b.rules.some((r) => r.group === i.group),
            "Grupo fora da composição",
          );
        }
        const cid = id();
        await transaction(async (db) => {
          await db.query(
            "INSERT INTO campaigns(id,seller_id,title,description,price,rules,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              cid,
              user.id,
              b.title,
              b.description,
              b.price,
              JSON.stringify(b.rules),
              b.publish ? "active" : "draft",
            ],
          );
          for (const i of b.inventory)
            for (let n = 0; n < i.quantity; n++)
              await db.query(
                "INSERT INTO physical_cards(id,campaign_id,edition_id,group_name,condition,photo,declared_value,reference_value,reference_source,reference_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                [
                  id(),
                  cid,
                  i.editionId,
                  i.group,
                  i.condition,
                  i.photo,
                  i.declaredValue,
                  i.referenceValue,
                  i.referenceSource,
                  i.referenceDate,
                ],
              );
          await audit(db, user.id, "campaign.created", cid, {
            rules: b.rules,
            version: 1,
          });
        });
        return json({
          id: cid,
          capacity: count,
          expected: estimate(b.rules, stock),
          sellerNet: b.price - commission(b.price),
          paymentFee: 0,
        });
      }
    }
    if (path === "ledger" && method === "GET") {
      requireUser(user, ["seller", "admin"]);
      return json(
        await query(
          "SELECT s.id,s.order_id,s.subtotal,s.shipping,s.commission,s.status,o.status payment_status,p.fee,COALESCE(SUM(i.refunded),0)::int refunded,COALESCE(SUM(i.commission_reversed),0)::int commission_reversed FROM suborders s JOIN orders o ON o.id=s.order_id JOIN payments p ON p.order_id=o.id JOIN order_items i ON i.suborder_id=s.id WHERE s.seller_id=$1 GROUP BY s.id,o.status,p.fee ORDER BY s.id",
          [user.id],
        ),
      );
    }
    if (path.startsWith("admin/")) {
      requireUser(user, ["admin"]);
      const section = path.slice(6);
      if (method === "GET") {
        const tables: Record<string, string> = {
          users: "SELECT id,email,name,role,verified,suspended FROM users",
          listings: "SELECT * FROM listings",
          orders: "SELECT * FROM orders ORDER BY created_at DESC",
          affiliates: "SELECT * FROM affiliates",
          campaigns: "SELECT * FROM campaigns",
          audit: "SELECT * FROM audit ORDER BY created_at DESC LIMIT 200",
          disputes: "SELECT * FROM disputes ORDER BY created_at DESC",
          catalog:
            "SELECT e.*,c.name,c.franchise,c.product_type FROM editions e JOIN cards c ON c.id=e.card_id",
          payments: "SELECT * FROM payments",
          refunds: "SELECT * FROM refunds",
        };
        if (section === "metrics") return json(await metrics());
        if (section === "reconcile") return json(await reconcile());
        check(tables[section], "Seção inexistente", 404);
        return json(await query(tables[section]));
      }
      if (method === "POST")
        return json(
          await transaction(async (db) => {
            if (section === "users") {
              const b = z
                .object({
                  id: uuid,
                  role: z.enum(["user", "seller", "admin"]),
                  suspended: z.boolean(),
                })
                .parse(body);
              check(
                b.id !== user.id,
                "Você não pode alterar seu próprio acesso",
              );
              await db.query(
                "UPDATE users SET role=$1,suspended=$2 WHERE id=$3",
                [b.role, b.suspended, b.id],
              );
              await audit(db, user.id, "admin.user.updated", b.id, b);
            } else if (section === "listings") {
              const b = z
                .object({
                  id: uuid,
                  status: z.enum(["active", "paused", "closed", "pending"]),
                })
                .parse(body);
              await db.query("UPDATE listings SET status=$1 WHERE id=$2", [
                b.status,
                b.id,
              ]);
              await audit(db, user.id, "moderation.listing", b.id, b);
            } else if (section === "disputes") {
              const b = z
                .object({
                  id: uuid,
                  status: z.enum(["open", "reviewing", "resolved"]),
                })
                .parse(body);
              await db.query("UPDATE disputes SET status=$1 WHERE id=$2", [
                b.status,
                b.id,
              ]);
              await audit(db, user.id, "dispute.updated", b.id, b);
            } else if (section === "campaigns") {
              const b = z
                .object({ id: uuid, status: z.enum(["active", "paused"]) })
                .parse(body);
              await db.query("UPDATE campaigns SET status=$1 WHERE id=$2", [
                b.status,
                b.id,
              ]);
              await audit(db, user.id, "campaign.moderated", b.id, b);
            } else if (section === "catalog") {
              const b = z
                .object({
                  name: str,
                  franchise: str,
                  productType: str,
                  collection: str,
                  code: str,
                  rarity: str,
                  language: str,
                  finish: str,
                  art: z.string(),
                })
                .parse(body);
              publicImage(b.art);
              const cid = id(),
                eid = id();
              await db.query("INSERT INTO cards VALUES($1,$2,$3,$4)", [
                cid,
                b.franchise,
                b.name,
                b.productType,
              ]);
              await db.query(
                "INSERT INTO editions VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                [
                  eid,
                  cid,
                  b.collection,
                  b.code,
                  b.rarity,
                  b.language,
                  b.finish,
                  b.art,
                ],
              );
              await audit(db, user.id, "catalog.created", eid);
            } else if (section === "affiliates") {
              const b = z
                .object({
                  id: uuid.optional(),
                  title: str,
                  description: z.string().max(3000),
                  franchise: str,
                  category: str,
                  platform: z.enum(["Shopee", "Mercado Livre"]),
                  externalSeller: str,
                  url: z.url(),
                  image: z.string(),
                  referencePrice: integer.nullable(),
                  active: z.boolean(),
                })
                .parse(body);
              const url = affiliateURL(b.url, b.platform);
              publicImage(b.image);
              const aid = b.id || id();
              await db.query(
                "INSERT INTO affiliates(id,title,description,franchise,category,platform,external_seller,url,image,reference_price,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET title=$2,description=$3,franchise=$4,category=$5,platform=$6,external_seller=$7,url=$8,image=$9,reference_price=$10,active=$11,updated_at=now()",
                [
                  aid,
                  b.title,
                  b.description,
                  b.franchise,
                  b.category,
                  b.platform,
                  b.externalSeller,
                  url,
                  b.image,
                  b.referencePrice,
                  b.active,
                ],
              );
              await audit(db, user.id, "affiliate.saved", aid);
            } else throw new AppError(404, "Operação inexistente");
            return { ok: true };
          }),
        );
    }
    throw new AppError(404, "Rota não encontrada");
  } catch (e) {
    if (e instanceof z.ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if ((e as any)?.code === "23505")
      return json(
        { error: "Registro já existente ou operação já realizada" },
        409,
      );
    console.error("API error", e instanceof Error ? e.message : "unknown");
    return json(
      {
        error: "Não foi possível concluir. Revise os dados e tente novamente.",
      },
      500,
    );
  }
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
