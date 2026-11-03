import { randomUUID, createHash } from "node:crypto";
import type { DB } from "./db";
export const id = () => randomUUID();
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new AppError(status, message);
}
export function cents(value: unknown) {
  check(
    Number.isSafeInteger(value) && Number(value) >= 0,
    "Valor inválido em centavos",
  );
  return Number(value);
}
export { commission, reversedCommission } from "./money";
export async function audit(
  db: DB,
  actor: string | null,
  action: string,
  entity: string,
  data: unknown = {},
) {
  await db.query(
    "INSERT INTO audit(id,actor_id,action,entity_id,data) VALUES($1,$2,$3,$4,$5)",
    [id(), actor, action, entity, JSON.stringify(data)],
  );
}
export async function notify(db: DB, user: string, body: string) {
  await db.query(
    "INSERT INTO notifications(id,user_id,body) VALUES($1,$2,$3)",
    [id(), user, body],
  );
}
export function publicImage(input: string) {
  check(input.length < 1_400_000, "Imagem muito grande");
  if (/^\/art\/[a-z0-9-]+\.svg$/.test(input)) return input;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    input,
  );
  check(match, "Use uma foto PNG, JPEG ou WebP de até 1 MB");
  const b = Buffer.from(match[2], "base64");
  check(b.length <= 1_000_000, "Imagem muito grande");
  const valid =
    (match[1] === "png" &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (match[1] === "jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255) ||
    (match[1] === "webp" &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP");
  check(valid, "Conteúdo de imagem inválido");
  return input;
}
