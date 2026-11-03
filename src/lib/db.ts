import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
type Row = Record<string, any>;
export type DB = {
  query<T extends Row = Row>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
};
const g = globalThis as typeof globalThis & {
  nexoDB?: Promise<DB>;
  nexoQueue?: Promise<unknown>;
};
export async function database(): Promise<DB> {
  if (!g.nexoDB)
    g.nexoDB = (async () => {
      let db: DB;
      if (process.env.DATABASE_URL)
        db = new Pool({ connectionString: process.env.DATABASE_URL });
      else {
        if (process.env.APP_MODE === "production")
          throw new Error("Production requires DATABASE_URL");
        const dir = resolve(process.env.DATA_DIR || ".data/postgres");
        mkdirSync(dir, { recursive: true });
        db = new PGlite(dir);
      }
      for (const file of readdirSync(resolve("migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        const sql = readFileSync(resolve("migrations", file), "utf8");
        if (db instanceof PGlite) await db.exec(sql);
        else await db.query(sql);
      }
      if (process.env.APP_MODE === "production") {
        const result = await db.query(
          "SELECT id FROM users WHERE email LIKE '%@nexo.test' LIMIT 1",
        );
        if (result.rows.length)
          throw new Error("Production refuses a database with demo accounts");
      }
      return db;
    })();
  return g.nexoDB;
}
export async function query<T extends Row = Row>(
  sql: string,
  params: any[] = [],
) {
  return transaction(async (db) => (await db.query<T>(sql, params)).rows);
}
// Serialize local embedded transactions. PostgreSQL deployments additionally use row locks.
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const previous = g.nexoQueue || Promise.resolve();
  let release!: () => void;
  g.nexoQueue = new Promise<void>((r) => (release = r));
  await previous;
  let client: DB | undefined;
  try {
    const root = await database();
    client = root instanceof Pool ? await root.connect() : root;
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    if (client && "release" in client)
      (client as import("pg").PoolClient).release();
    release();
  }
}
export async function rows(db: DB, sql: string, p: any[] = []) {
  return (await db.query(sql, p)).rows;
}
