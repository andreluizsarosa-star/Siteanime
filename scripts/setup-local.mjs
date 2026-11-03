import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (process.env.APP_MODE === "production") {
  console.log("Produção: configuração local demo não criada.");
  process.exit(0);
}
if (existsSync(".env.local")) {
  console.log(".env.local existente preservado.");
  process.exit(0);
}
const content = readFileSync(".env.example", "utf8").replace(
  "SANDBOX_WEBHOOK_SECRET=",
  "SANDBOX_WEBHOOK_SECRET=" + randomBytes(32).toString("hex"),
);
writeFileSync(".env.local", content, { mode: 0o600, flag: "wx" });
console.log(
  "Configuração local criada com chave HMAC aleatória privada. Nenhum valor secreto exibido.",
);
