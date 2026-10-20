#!/usr/bin/env node
'use strict';

/*
 * DNM&LTDA Lava Rápido — supervisor para a hospedagem Node.js da Hostinger.
 * Mesmo modelo do APP OBRA: a Hostinger espera um processo Node na porta PORT;
 * este script só sobe o PocketBase nessa porta e o mantém vivo. O PocketBase
 * serve a API e o app (pb_public) no mesmo endereço.
 *
 * Diferença importante: os dados (pb_data) ficam FORA da pasta do site
 * (PB_DATA_DIR, padrão ~/dnm-lava-rapido-data), para uma nova publicação nunca
 * apagar o banco.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PB_BINARY = path.join(ROOT, 'pocketbase');
const DATA_DIR = process.env.PB_DATA_DIR || path.join(os.homedir(), 'dnm-lava-rapido-data');

if (!fs.existsSync(PB_BINARY)) {
  console.error(`[server.js] PocketBase não encontrado em ${PB_BINARY}`);
  process.exit(1);
}
try {
  fs.chmodSync(PB_BINARY, 0o755);
} catch (err) {
  console.error('[server.js] chmod falhou (seguindo):', err.message);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

const comuns = [`--dir=${DATA_DIR}`, `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`];

// Mantém o admin da DNM&LTDA (variáveis de ambiente do site na Hostinger).
if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
  const r = spawnSync(PB_BINARY, ['superuser', 'upsert', process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD, ...comuns], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  console.log(r.status === 0 ? '[server.js] admin ok' : `[server.js] admin falhou: ${r.stderr || r.stdout}`);
}

const args = [
  'serve',
  `--http=0.0.0.0:${PORT}`,
  ...comuns,
  `--hooksDir=${path.join(ROOT, 'pb_hooks')}`,
  '--hooksWatch=false',
  `--publicDir=${path.join(ROOT, 'pb_public')}`,
];

let encerrando = false;
let filho = null;

function iniciar() {
  console.log(`[server.js] iniciando PocketBase (dados em ${DATA_DIR})`);
  filho = spawn(PB_BINARY, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  filho.on('exit', (code, signal) => {
    console.error(`[server.js] PocketBase saiu (code=${code}, signal=${signal}).`);
    if (!encerrando) setTimeout(iniciar, 3000);
  });
  filho.on('error', (err) => console.error('[server.js] falha ao iniciar o PocketBase:', err));
}

iniciar();

function desligar(sinal) {
  encerrando = true;
  if (filho && !filho.killed) filho.kill(sinal);
  process.exit(0);
}
process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));
