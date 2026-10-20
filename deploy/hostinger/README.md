# Publicação na Hostinger (hospedagem Node.js)

**No ar:** https://seagreen-cattle-355822.hostingersite.com (site Node.js no plano Business da DNM&LTDA)

## Como funciona
A Hostinger roda apps Node pelo LiteSpeed (`lsnode.js`): o `listen()` do Node é
redirecionado para um socket de arquivo e só ali chega o tráfego. Também não deixa
o Node se conectar a outro processo pela rede interna. Por isso:

1. `server.js` abre a "porta" na hora (exigência da Hostinger: `listen()` em até 3 s).
2. Marca esse socket para ser herdado (`execve.node`, que vem de `execve/execve.c`).
3. Chama `execve()`: o mesmo processo vira o **PocketBase do Lava Rápido**
   (`pocketbase/main.go`). É o `main.go` oficial do PocketBase 0.40.4 e atende no
   socket herdado (`PB_LISTEN_FD`).

Os dados ficam fora da pasta publicada: `PB_DATA_DIR=/home/u732612765/domains/<domínio>/lava-rapido-data`.
Uma nova publicação nunca apaga o banco (testado).

**Tempo real:** o proxy da Hostinger segura os eventos SSE. Por isso as telas da
fila também consultam o servidor a cada 10 s e continuam se atualizando sozinhas.

## Variáveis de ambiente do site (hPanel → Node.js → Environment)
| Nome | Valor |
|---|---|
| `PB_ADMIN_EMAIL` | admin do PocketBase (DNM&LTDA) |
| `PB_ADMIN_PASSWORD` | senha do admin, guardada no cofre da DNM&LTDA |
| `PB_DATA_DIR` | pasta dos dados (fora de `public_html`) |
| `PB_LOG_FILE` | (opcional, diagnóstico) arquivo para a saída do PocketBase |

## Publicar uma nova versão
1. `./scripts/empacotar-hostinger.sh`: gera `dist-hostinger/lava-rapido.zip`. Precisa de Go, gcc e Node.
2. API da Hostinger "Generate upload URL" → `./scripts/enviar-pacote-hostinger.sh URL AUTH_KEY REST_AUTH_KEY`
3. API "Start Node.js build": `source_type=archive`, `archive_path=lava-rapido.zip`,
   `app_type=other`, `entry_file=server.js`, `output_directory=.`, `build_script=build`, Node 22.
4. Conferir `https://<domínio>/api/health`.

O Claude Code faz esses passos sozinho pelo conector da Hostinger.
