import { randomBytes } from "node:crypto";
import { compare, hash as passwordHash } from "bcryptjs";
import { query, transaction, rows, type DB } from "../../lib/db";
import { check, id, hash, audit } from "../../lib/core";
export type User = {
  id: string;
  email: string;
  name: string;
  role: "user" | "seller" | "admin";
  verified: boolean;
  suspended: boolean;
};
export async function currentUser(token?: string): Promise<User | null> {
  if (!token) return null;
  const [u] = await query(
    "SELECT u.id,u.email,u.name,u.role,u.verified,u.suspended FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash(token)],
  );
  return u && !u.suspended ? (u as User) : null;
}
export function requireUser(
  u: User | null,
  roles?: string[],
): asserts u is User {
  check(u, "Entre na sua conta para continuar", 401);
  check(!u.suspended, "Conta suspensa", 403);
  if (roles) check(roles.includes(u.role), "Sem permissão", 403);
}
export async function session(db: DB, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')", [
    hash(token),
    userId,
  ]);
  return token;
}
export async function login(email: string, password: string) {
  const [u] = await query("SELECT * FROM users WHERE email=$1", [
    email.toLowerCase(),
  ]);
  check(
    u && (await compare(password, u.password_hash)),
    "E-mail ou senha incorretos",
    401,
  );
  check(!u.suspended, "Conta suspensa", 403);
  return transaction((db) => session(db, u.id));
}
export async function register(name: string, email: string, password: string) {
  check(password.length >= 10, "A senha deve ter pelo menos 10 caracteres");
  const uid = id();
  await transaction(async (db) => {
    check(
      !(
        await rows(db, "SELECT id FROM users WHERE email=$1", [
          email.toLowerCase(),
        ])
      ).length,
      "E-mail já cadastrado",
      409,
    );
    await db.query(
      "INSERT INTO users(id,email,password_hash,name) VALUES($1,$2,$3,$4)",
      [uid, email.toLowerCase(), await passwordHash(password, 12), name],
    );
    await audit(db, uid, "account.created", uid);
  });
  return uid;
}
