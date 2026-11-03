import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { query } from "../../lib/db";
import { hash } from "../../lib/core";
export async function sendToken(
  userId: string,
  email: string,
  kind: "verify" | "reset",
) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO auth_tokens VALUES($1,$2,$3,now()+interval '30 minutes')",
    [hash(token), userId, kind],
  );
  const url = `${process.env.APP_URL || "http://localhost:3000"}/conta?${kind}=${token}`;
  const text = `${kind === "verify" ? "Verifique seu e-mail" : "Redefina sua senha"}: ${url}\nEste link expira em 30 minutos.`;
  if (process.env.SMTP_URL)
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Nexo TCG · Sua conta",
      text,
    });
  else {
    if (process.env.APP_MODE === "production")
      throw new Error("Configure SMTP_URL");
    const directory = process.env.MAIL_OUTBOX_DIR || ".data/outbox";
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(`${directory}/${Date.now()}-${userId}.txt`, text, {
      mode: 0o600,
    });
  }
}
