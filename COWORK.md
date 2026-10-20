# Tarefas para o Cowork (o que o Claude Code não tem acesso para fazer)

O código está pronto e testado. Estes passos precisam de acesso às contas da DNM&LTDA.

## 1. Criar o repositório no GitHub (obrigatório)
1. Em github.com, conta **Dnmltda**, criar o repositório **`lava-rapido`**: privado e **vazio**, sem README, sem .gitignore e sem licença.
2. Avisar o Claude Code na sessão. Ele faz o push do código (o histórico está pronto em `lava-rapido.bundle`).
   - Alternativa sem o Claude: `git clone lava-rapido.bundle lava-rapido && cd lava-rapido && git remote set-url origin https://github.com/Dnmltda/lava-rapido.git && git push -u origin main`

## 2. Backend (PocketBase) para a demonstração
Opção A: **Fly.io** (a conta já existe):
1. Na pasta `pocketbase/`: `fly launch --no-deploy` (região `gru`, nome sugerido `dnm-lava-rapido-api`).
2. `fly volumes create pb_data --size 1 --region gru`
3. No `fly.toml`: `[[mounts]] source="pb_data" destination="/pb/pb_data"`, com `internal_port = 8080`.
4. `fly deploy`
5. Criar o admin: `fly ssh console -C "/pb/pocketbase superuser upsert EMAIL SENHA --dir /pb/pb_data"`
6. Mandar ao Claude: a **URL https** do backend, o **e-mail** e a **senha** do admin (por canal seguro).

Opção B: **Oracle Cloud Always Free** (VM Ubuntu): o mesmo Dockerfile com Docker, ou o binário com systemd, atrás de Caddy (HTTPS automático).

## 3. Frontend na Hostinger
1. Escolher o endereço do app, por exemplo `lavarapido.dnmltda.com.br`, e criar o subdomínio.
2. Com a URL do backend em mãos: `cd web && echo "VITE_PB_URL=https://URL-DO-BACKEND" > .env.local && npm install && npm run build`
3. Enviar o conteúdo de `web/dist/` para a pasta do subdomínio.
4. Criar `.htaccess` na pasta (o app tem rotas como `/demo/fila`):
   ```
   RewriteEngine On
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.html [L]
   ```
5. Ativar o SSL (HTTPS) do subdomínio no hPanel. É obrigatório para o PWA e as notificações.

## 4. Criar a demo no servidor
```
PB_URL=https://URL-DO-BACKEND PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/criar-empresa.mjs --demo
```
Depois abrir `https://ENDERECO-DO-APP/demo`. Os logins estão no README.

## 5. Backup diário (antes do primeiro cliente real)
Copiar `pb_data` todo dia para fora do servidor (Google Drive, por exemplo). No Fly: `fly ssh sftp get /pb/pb_data/data.db`, agendado. O Claude Code pode montar o script quando o servidor estiver definido.

## Para mandar de volta ao Claude Code
- URL do repositório criado
- URL do backend + e-mail/senha do admin do PocketBase
- Endereço do frontend (subdomínio)
- Se tiver: dados do primeiro lava rápido real (lista no fim do planejamento)
