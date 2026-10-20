#!/usr/bin/env node
'use strict';

/*
 * DNM&LTDA Lava Rápido — inicialização na hospedagem Node.js da Hostinger.
 *
 * A Hostinger roda o app pelo LiteSpeed (lsnode.js): o listen() do Node é
 * redirecionado para um socket de arquivo, e o tráfego só chega ali. O
 * PocketBase oficial só escuta em porta TCP, então:
 *   1. o Node abre a "porta" na hora (exigência: listen() em até 3 s) e responde
 *      uma página "iniciando" enquanto prepara tudo;
 *   2. marca esse socket para ser herdado e chama execve(): o MESMO processo
 *      vira o PocketBase do Lava Rápido (deploy/hostinger/pocketbase), que
 *      atende no socket herdado (PB_LISTEN_FD). Nenhuma conexão se perde.
 * Fora da Hostinger o socket é TCP comum e funciona do mesmo jeito.
 *
 * Os dados (pb_data) ficam FORA da pasta publicada (PB_DATA_DIR), então uma
 * nova publicação nunca apaga o banco.
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
const ESPERA_MS = 500;

process.on('uncaughtException', (err) => console.error('[server.js] erro:', err && err.stack ? err.stack : err));

const provisorio = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '3', Connection: 'close' });
  res.end('DNM&LTDA Lava Rápido está iniciando. Recarregue em alguns segundos.');
});

provisorio.listen(PORT, '0.0.0.0', () => {
  console.log(`[server.js] escutando em ${JSON.stringify(provisorio.address())} (pid ${process.pid})`);

  try {
    fs.chmodSync(PB_BINARY, 0o755);
  } catch (err) {
    console.error('[server.js] chmod falhou (seguindo):', err.message);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let nativo;
  try {
    nativo = require(path.join(ROOT, 'execve.node'));
  } catch (err) {
    console.error('[server.js] FATAL: módulo execve.node não carregou:', err.message);
    process.exit(1);
  }

  const virarPocketBase = () => {
    setTimeout(() => {
      provisorio.closeAllConnections();
      const fd = provisorio._handle && provisorio._handle.fd;
      if (typeof fd !== 'number' || fd < 0) {
        console.error('[server.js] FATAL: não achei o socket do servidor.');
        process.exit(1);
      }
      try {
        nativo.herdar(fd);
        process.env.PB_LISTEN_FD = String(fd);
        console.log(`[server.js] virando PocketBase no socket herdado (fd ${fd}); dados em ${DATA_DIR}`);
        nativo.execve(
          PB_BINARY,
          [
            PB_BINARY,
            'serve',
            '--http=127.0.0.1:8080',
            `--dir=${DATA_DIR}`,
            `--migrationsDir=${path.join(ROOT, 'pb_migrations')}`,
            `--hooksDir=${path.join(ROOT, 'pb_hooks')}`,
            '--hooksWatch=false',
            `--publicDir=${path.join(ROOT, 'pb_public')}`,
          ],
          process.env.PB_LOG_FILE || undefined,
        );
      } catch (err) {
        console.error('[server.js] FATAL: execve falhou:', err.message);
      }
      process.exit(1);
    }, ESPERA_MS);
  };

  // Mantém o admin da DNM&LTDA (variáveis de ambiente do site), sem travar o Node.
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
