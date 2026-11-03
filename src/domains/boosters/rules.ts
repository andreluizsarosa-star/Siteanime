import { randomInt } from "node:crypto";
import { check } from "../../lib/core";
export type Rule = { group: string; count: number };
export function capacity(rules: Rule[], stock: { group_name: string }[]) {
  check(
    rules.length > 0 &&
      new Set(rules.map((r) => r.group)).size === rules.length,
    "Grupos inválidos",
  );
  return Math.min(
    ...rules.map((r) => {
      check(Number.isInteger(r.count) && r.count > 0, "Quantidade inválida");
      return Math.floor(
        stock.filter((s) => s.group_name === r.group).length / r.count,
      );
    }),
  );
}
export function draw<T extends { group_name: string }>(
  rules: Rule[],
  stock: T[],
) {
  check(capacity(rules, stock) > 0, "Estoque insuficiente", 409);
  const selected: T[] = [];
  for (const r of rules) {
    const pool = stock.filter((s) => s.group_name === r.group);
    for (let i = 0; i < r.count; i++) {
      const j = randomInt(pool.length);
      selected.push(pool.splice(j, 1)[0]);
    }
  }
  return selected;
}
export { expectedValue as estimate } from "../../lib/money";
