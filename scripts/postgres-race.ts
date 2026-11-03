import { spawn } from "node:child_process";
import { seed } from "../src/lib/seed";
import { query } from "../src/lib/db";
process.env.DATABASE_URL = process.env.NEXO_TEST_DATABASE_URL;
if (!process.env.DATABASE_URL)
  throw new Error(
    "Use um NEXO_TEST_DATABASE_URL de teste dedicado; não use banco de produção.",
  );
await seed();
const suffix = crypto.randomUUID();
await query(
  "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,price,stock) VALUES('pg-race','demo-seller','forest-pt','Teste de corrida','Dado fictício','NM',1000,1) ON CONFLICT(id) DO UPDATE SET stock=1",
);
for (const who of ["demo-buyer", "demo-admin"])
  await query(
    "INSERT INTO addresses VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
    ["race-" + who, who, "Teste", JSON.stringify({ city: "Teste" })],
  );
const run = (who: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/pg-race-worker.ts", who],
      {
        env: { ...process.env, RACE_ID: suffix },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("exit", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err)),
    );
  });
const result = await Promise.all([run("demo-buyer"), run("demo-admin")]);
if (
  result.filter((r) => r === "RESERVED").length !== 1 ||
  result.filter((r) => r === "SOLD_OUT").length !== 1
)
  throw new Error(JSON.stringify(result));
console.log(
  "PASS: dois processos, compradores diferentes, PostgreSQL real: uma reserva e uma recusa.",
);
process.exit(0);
