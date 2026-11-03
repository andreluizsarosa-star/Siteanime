/** Integer cents, round half up. Use floating division only for display formatting. */
function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Valor inválido em centavos");
}
export function commission(amount: number) {
  integer(amount);
  return Number((BigInt(amount) * 5n + 50n) / 100n);
}
export function reversedCommission(
  original: number,
  refunded: number,
  subtotal: number,
) {
  integer(original);
  integer(refunded);
  integer(subtotal);
  if (!subtotal || refunded > subtotal) throw new Error("Reembolso inválido");
  return Number(
    (BigInt(original) * BigInt(refunded) + BigInt(Math.floor(subtotal / 2))) /
      BigInt(subtotal),
  );
}
export function expectedValue(
  rules: { group: string; count: number }[],
  stock: { group_name: string; reference_value: number | null }[],
) {
  let numerator = 0n,
    denominator = 1n;
  for (const rule of rules) {
    if (!Number.isInteger(rule.count) || rule.count <= 0) return null;
    const pool = stock.filter((s) => s.group_name === rule.group);
    if (
      !pool.length ||
      pool.some(
        (s) =>
          s.reference_value === null ||
          !Number.isSafeInteger(s.reference_value) ||
          s.reference_value < 0,
      )
    )
      return null;
    const sum =
        pool.reduce((n, s) => n + BigInt(s.reference_value!), 0n) *
        BigInt(rule.count),
      den = BigInt(pool.length);
    numerator = numerator * den + sum * denominator;
    denominator *= den;
  }
  return Number((numerator + denominator / 2n) / denominator);
}
export function suggestedPrice(expected: number) {
  integer(expected);
  return Number((BigInt(expected) * 100n + 94n) / 95n);
}
