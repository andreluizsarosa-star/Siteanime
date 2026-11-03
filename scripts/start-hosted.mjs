import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
if (process.env.APP_MODE !== "demo")
  throw new Error(
    "Esta imagem é exclusiva da demonstração. Pagamentos reais continuam bloqueados.",
  );
const runtime = { ...process.env };
runtime.APP_URL ||= runtime.RENDER_EXTERNAL_URL || "";
if (runtime.APP_URL.startsWith("https://")) runtime.COOKIE_SECURE = "true";
runtime.SANDBOX_WEBHOOK_SECRET ||= randomBytes(32).toString("hex");
const port = Number(runtime.PORT || "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT inválida");
// CLI and server never access the embedded database at the same time.
for (const script of ["scripts/migrate.ts", "scripts/seed.ts"]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", script], {
    env: runtime,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    String(port),
  ],
  { env: runtime, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.kill(signal));
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
server.on("exit", (code) => process.exit(code ?? 0));
