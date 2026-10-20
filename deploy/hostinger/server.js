#!/usr/bin/env node
'use strict';

/*
 * DNM&LTDA Lava Rápido — inicialização na hospedagem Node.js da Hostinger.
 *
 * O que vale nesse ambiente (comprovado no APP OBRA e de novo aqui):
 *  - o processo Node iniciado pela Hostinger precisa chamar listen() na porta
 *    (PORT, padrão 8080) em até 3 segundos;
 *  - o tráfego fica preso a ESSE processo; outro processo na mesma porta não recebe;
 *  - conexão interna para outra porta (proxy Node → PocketBase) é bloqueada.
 *
 * Solução (mesma do APP OBRA): abrir a porta na hora com uma página
 * "iniciando", preparar os dados e então chamar execve(): o MESMO processo
 * (mesmo PID) vira o PocketBase, que passa a servir a API e o app (pb_public)
 * direto na porta. Se o PocketBase cair, o processo termina e a Hostinger
 * reinicia o `node server.js`.
 *
 * Os dados (pb_data) ficam FORA da pasta publicada (PB_DATA_DIR), então uma
 * nova publicação nunca apaga o banco. O módulo execve.node é compilado de
 * deploy/hostinger/execve/execve.c.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawnSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PB_BINARY = path.join(ROOT, 'pocketbase');
const DATA_DIR = process.env.PB_DATA_DIR || path.join(os.homedir(), 'dnm-lava-rapido-data');
const ESPERA_MS = 1000;

process.on('uncaughtException', (err) => console.error('[server.js] erro:', err && err.stack ? err.stack : err));

// 1) Abre a porta na hora (exigência da Hostinger).
const provisorio = http.createServer((req, res) => {
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '3' });
  res.end('DNM&LTDA Lava Rápido está iniciando. Recarregue em alguns segundos.');
});

provisorio.listen(PORT, '0.0.0.0', () => {
  console.log(`[server.js] porta ${PORT} aberta (pid ${process.pid})`);

  // 2) Prepara binário, pasta de dados e admin.
  try {
    fs.chmodSync(PB_BINARY, 0o755);
  } catch (err) {
    console.error('[server.js] chmod falhou (seguindo):', err.message);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
    const r = spawnSync(
      PB_BINARY,
      ['superuser', 'upsert', process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD, `--dir=${DATA_DIR}`, `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`],
      { cwd: ROOT, encoding: 'utf8', timeout: 20000 },
    );
    console.log(r.status === 0 ? '[server.js] admin ok' : `[server.js] admin falhou: ${r.stderr || r.stdout || r.error}`);
  }

  let execve;
  try {
    execve = require(path.join(ROOT, 'execve.node')).execve;
  } catch (err) {
    console.error('[server.js] FATAL: módulo execve.node não carregou:', err.message);
    process.exit(1);
  }

  // 3) Fecha a porta provisória e vira o PocketBase (mesmo processo).
  setTimeout(() => {
    provisorio.close(() => {
      console.log(`[server.js] virando PocketBase (dados em ${DATA_DIR})`);
      try {
        execve(PB_BINARY, [
          PB_BINARY,
          'serve',
          `--http=0.0.0.0:${PORT}`,
          `--dir=${DATA_DIR}`,
          `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`,
          `--hooksDir=${path.join(ROOT, 'pb_hooks')}`,
          '--hooksWatch=false',
          `--publicDir=${path.join(ROOT, 'pb_public')}`,
        ]);
      } catch (err) {
        console.error('[server.js] FATAL: execve falhou:', err.message);
      }
      process.exit(1);
    });
  }, ESPERA_MS);
});
