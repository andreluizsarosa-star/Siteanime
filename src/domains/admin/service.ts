import { query } from "../../lib/db";
export async function metrics() {
  return {
    internal: await query(
      "SELECT COUNT(*)::int orders,COALESCE(SUM(subtotal),0)::int products,COALESCE(SUM(commission),0)::int commission FROM orders WHERE status IN ('paid','partially_refunded')",
    ),
    external: await query("SELECT COUNT(*)::int clicks FROM affiliate_clicks"),
    note: "Demonstração. Cliques não são vendas. Sem conversões externas confirmadas.",
  };
}
export async function reconcile() {
  return query(
    "SELECT o.id,o.status order_status,p.status provider_status,o.total,p.amount,p.provider FROM orders o JOIN payments p ON p.order_id=o.id WHERE p.amount<>o.total OR (o.status='paid' AND p.status<>'approved') OR (p.status='approved' AND o.status NOT IN ('paid','partially_refunded','refunded'))",
  );
}
