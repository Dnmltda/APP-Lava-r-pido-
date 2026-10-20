#!/usr/bin/env node
// Gera um backup completo no PocketBase (banco + arquivos) e baixa o .zip.
//   PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/backup.mjs [pasta]
// Mantém no servidor só os 7 backups mais recentes feitos por este script.
import { mkdirSync, writeFileSync } from "node:fs";

const PB = process.env.PB_URL;
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
const pasta = process.argv[2] || "backups";
if (!PB || !PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_URL, PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

async function api(method, path, token, body) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const token = (await api("POST", "/api/collections/_superusers/auth-with-password", null, {
  identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD,
})).token;

const data = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const nome = `diario_${data}.zip`;
await api("POST", "/api/backups", token, { name: nome });

const arquivoToken = (await api("POST", "/api/files/token", token)).token;
const res = await fetch(`${PB}/api/backups/${nome}?token=${arquivoToken}`);
if (!res.ok) throw new Error(`download: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
mkdirSync(pasta, { recursive: true });
writeFileSync(`${pasta}/${nome}`, buf);
console.log(`Backup ${nome}: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);

const lista = (await api("GET", "/api/backups", token))
  .filter((b) => b.key.startsWith("diario_"))
  .sort((a, b) => b.key.localeCompare(a.key));
for (const b of lista.slice(7)) {
  await api("DELETE", `/api/backups/${b.key}`, token);
  console.log(`Removido do servidor: ${b.key}`);
}
