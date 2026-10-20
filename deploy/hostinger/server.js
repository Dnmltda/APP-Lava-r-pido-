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
const { execFile } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PB_BINARY = path.join(ROOT, 'pocketbase');
const DATA_DIR = process.env.PB_DATA_DIR || path.join(os.homedir(), 'dnm-lava-rapido-data');
const ESPERA_MS = 1000;

process.on('uncaughtException', (err) => console.error('[server.js] erro:', err && err.stack ? err.stack : err));

// 1) Abre a porta na hora (exigência da Hostinger).
const provisorio = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '3', Connection: 'close' });
  res.end('DNM&LTDA Lava Rápido está iniciando. Recarregue em alguns segundos.');
});

provisorio.listen(PORT, '0.0.0.0', () => {
  console.log(`[server.js] porta ${PORT} aberta (pid ${process.pid})`);

  // 2) Prepara binário, pasta de dados e admin, SEM travar o Node: a Hostinger
  //    testa o app durante a inicialização e reinicia se ele não responder.
  try {
    fs.chmodSync(PB_BINARY, 0o755);
  } catch (err) {
    console.error('[server.js] chmod falhou (seguindo):', err.message);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let execve;
  try {
    execve = require(path.join(ROOT, 'execve.node')).execve;
  } catch (err) {
    console.error('[server.js] FATAL: módulo execve.node não carregou:', err.message);
    process.exit(1);
  }

  const virarPocketBase = () => {
    // 3) Fecha a porta provisória e vira o PocketBase (mesmo processo).
    setTimeout(() => {
      provisorio.closeAllConnections();
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
  };

  if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
    execFile(
      PB_BINARY,
      ['superuser', 'upsert', process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD, `--dir=${DATA_DIR}`, `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`],
      { cwd: ROOT, timeout: 20000 },
      (err, stdout, stderr) => {
        console.log(err ? `[server.js] admin falhou: ${stderr || stdout || err.message}` : '[server.js] admin ok');
        virarPocketBase();
      },
    );
  } else {
    virarPocketBase();
  }
});
