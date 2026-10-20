#!/usr/bin/env node
'use strict';

/*
 * DNM&LTDA Lava Rápido — servidor para a hospedagem Node.js da Hostinger.
 *
 * A Hostinger exige que o processo Node escute a porta (PORT, padrão 8080) em
 * poucos segundos. Então este script:
 *   1. escuta a porta na hora;
 *   2. sobe o PocketBase numa porta interna (127.0.0.1) e o mantém vivo;
 *   3. repassa cada requisição para o PocketBase (inclusive o tempo real, SSE).
 * O PocketBase serve a API e o app (pb_public).
 *
 * Os dados (pb_data) ficam FORA da pasta publicada (PB_DATA_DIR), para uma nova
 * publicação nunca apagar o banco.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.PORT || 8080);
const PB_PORT = Number(process.env.PB_INTERNAL_PORT || 28090);
const ROOT = __dirname;
const PB_BINARY = path.join(ROOT, 'pocketbase');
const DATA_DIR = process.env.PB_DATA_DIR || path.join(os.homedir(), 'dnm-lava-rapido-data');

let pbPronto = false;
let ultimoErro = 0;

// ------------------------------------------------------------ proxy
function ipDoCliente(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (xff.length) return xff[xff.length - 1];
  return req.socket.remoteAddress || '';
}

const servidor = http.createServer((req, res) => {
  const headers = { ...req.headers };
  headers['x-real-ip'] = ipDoCliente(req);
  headers['x-forwarded-proto'] = headers['x-forwarded-proto'] || 'https';
  const destino = http.request(
    { host: '127.0.0.1', port: PB_PORT, method: req.method, path: req.url, headers },
    (resp) => {
      res.writeHead(resp.statusCode || 502, resp.headers);
      resp.pipe(res);
    },
  );
  destino.on('error', (err) => {
    if (!ultimoErro || Date.now() - ultimoErro > 30000) {
      ultimoErro = Date.now();
      console.error(`[server.js] proxy → PocketBase falhou: ${err.code || ''} ${err.message}`);
    }
    if (res.headersSent) return res.end();
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5' });
    res.end(pbPronto ? 'Servidor indisponível. Tente de novo.' : 'Iniciando o DNM&LTDA Lava Rápido… recarregue em alguns segundos.');
  });
  req.pipe(destino);
  // Tempo real (SSE): sem limite de tempo na conexão.
  req.socket.setTimeout(0);
});
servidor.keepAliveTimeout = 65000;
servidor.requestTimeout = 0;
servidor.listen(PORT, '0.0.0.0', () => console.log(`[server.js] escutando na porta ${PORT}`));

// --------------------------------------------------------- PocketBase
function prepararPocketBase() {
  if (!fs.existsSync(PB_BINARY)) {
    console.error(`[server.js] PocketBase não encontrado em ${PB_BINARY}`);
    return false;
  }
  try {
    fs.chmodSync(PB_BINARY, 0o755);
  } catch (err) {
    console.error('[server.js] chmod falhou (seguindo):', err.message);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Mantém o admin da DNM&LTDA (variáveis de ambiente do site na Hostinger).
  if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
    const r = spawnSync(
      PB_BINARY,
      ['superuser', 'upsert', process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD, `--dir=${DATA_DIR}`, `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`],
      { cwd: ROOT, encoding: 'utf8' },
    );
    console.log(r.status === 0 ? '[server.js] admin ok' : `[server.js] admin falhou: ${r.stderr || r.stdout}`);
  }
  return true;
}

let encerrando = false;
let filho = null;

function iniciar() {
  console.log(`[server.js] iniciando PocketBase em 127.0.0.1:${PB_PORT} (dados em ${DATA_DIR})`);
  filho = spawn(
    PB_BINARY,
    [
      'serve',
      `--http=127.0.0.1:${PB_PORT}`,
      `--dir=${DATA_DIR}`,
      `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`,
      `--hooksDir=${path.join(ROOT, 'pb_hooks')}`,
      '--hooksWatch=false',
      `--publicDir=${path.join(ROOT, 'pb_public')}`,
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  );
  // A Hostinger só guarda o que o Node escreve no console.
  const repassar = (dados) => {
    for (const linha of String(dados).split('\n')) if (linha.trim()) console.log(`[pocketbase] ${linha.slice(0, 500)}`);
  };
  filho.stdout.on('data', repassar);
  filho.stderr.on('data', repassar);
  pbPronto = true;
  filho.on('exit', (code, signal) => {
    pbPronto = false;
    console.error(`[server.js] PocketBase saiu (code=${code}, signal=${signal}).`);
    if (!encerrando) setTimeout(iniciar, 3000);
  });
  filho.on('error', (err) => console.error('[server.js] falha ao iniciar o PocketBase:', err));
}

// Depois do listen(), para a Hostinger ver o app de pé na hora.
setImmediate(() => {
  if (prepararPocketBase()) iniciar();
});

function desligar(sinal) {
  encerrando = true;
  if (filho && !filho.killed) filho.kill(sinal);
  servidor.close();
  process.exit(0);
}
process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));
