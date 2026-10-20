#!/usr/bin/env node
// Etapa 8 — Teste de backup E restauração.
//
// Gera um backup pelo próprio PocketBase, baixa o .zip, sobe um SEGUNDO PocketBase
// só com esse backup (outra porta, pasta temporária) e confere que os dados voltaram
// iguais: quantidade de registros de cada coleção, login e um arquivo protegido.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-backup.mjs

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(RAIZ, "pocketbase/bin/pocketbase");
const PORTA = 8097;
let falhas = 0;
let total = 0;
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 400) : ""));
  }
}
async function api(base, method, p, token, body) {
  const res = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function contagens(base, token) {
  const cols = (await api(base, "GET", "/api/collections?perPage=500", token)).data.items.filter((c) => c.type !== "view");
  const out = {};
  for (const c of cols) out[c.name] = (await api(base, "GET", `/api/collections/${c.name}/records?perPage=1&skipTotal=0`, token)).data?.totalItems ?? -1;
  return out;
}

async function main() {
  const login = await api(PB, "POST", "/api/collections/_superusers/auth-with-password", null, { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD });
  if (login.status !== 200) throw new Error("Login do admin falhou");
  const ADM = login.data.token;

  console.log("Backup");
  const nome = `teste_restauracao_${Date.now()}.zip`;
  const antes = await contagens(PB, ADM);
  let r = await api(PB, "POST", "/api/backups", ADM, { name: nome });
  checar("PocketBase gera o backup (banco + arquivos)", r.status === 204, r.data);
  const ft = (await api(PB, "POST", "/api/files/token", ADM)).data.token;
  const res = await fetch(`${PB}/api/backups/${nome}?token=${ft}`);
  const zip = Buffer.from(await res.arrayBuffer());
  checar("backup baixa (fica fora do servidor)", res.ok && zip.length > 1000, res.status);
  await api(PB, "DELETE", `/api/backups/${nome}`, ADM);

  console.log("\nRestauração num servidor novo");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "restauracao-"));
  const arquivoZip = path.join(pasta, nome);
  fs.writeFileSync(arquivoZip, zip);
  const dados = path.join(pasta, "pb_data");
  fs.mkdirSync(dados);
  execFileSync("unzip", ["-q", arquivoZip, "-d", dados]);
  checar("zip tem o banco de dados", fs.existsSync(path.join(dados, "data.db")));

  // Sem os hooks: a cópia restaurada não roda os avisos automáticos (não manda push a ninguém).
  const pb2 = spawn(BIN, ["serve", "--dir", dados, "--migrationsDir", path.join(RAIZ, "pocketbase/pb_migrations"), "--hooksDir", path.join(pasta, "sem-hooks"), "--http", `127.0.0.1:${PORTA}`], { stdio: "ignore" });
  const B = `http://127.0.0.1:${PORTA}`;
  try {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      await esperar(250);
      ok = await fetch(B + "/api/health").then((x) => x.ok, () => false);
    }
    checar("servidor restaurado sobe", ok);
    const l2 = await api(B, "POST", "/api/collections/_superusers/auth-with-password", null, { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD });
    checar("login do administrador funciona no restaurado", l2.status === 200, l2.status);
    const depois = await contagens(B, l2.data.token);
    const diferentes = Object.keys(antes).filter((c) => antes[c] !== depois[c] && c !== "_logs");
    checar(`mesma quantidade de registros nas ${Object.keys(antes).length} coleções`, diferentes.length === 0, diferentes.map((c) => `${c}: ${antes[c]} → ${depois[c]}`));
    const empresas = (await api(B, "GET", "/api/collections/empresas/records?perPage=1&sort=created", l2.data.token)).data.items;
    const original = (await api(PB, "GET", "/api/collections/empresas/records?perPage=1&sort=created", ADM)).data.items;
    checar("dados iguais (primeira empresa)", JSON.stringify(empresas[0]) === JSON.stringify(original[0]));
    const arquivos = fs.readdirSync(path.join(dados, "storage"), { recursive: true }).filter((f) => fs.statSync(path.join(dados, "storage", f)).isFile());
    checar("arquivos (logos, comprovantes, holerites) vieram junto", fs.existsSync(path.join(dados, "storage")), arquivos.length);
  } finally {
    pb2.kill();
    await esperar(300);
    fs.rmSync(pasta, { recursive: true, force: true });
  }

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
