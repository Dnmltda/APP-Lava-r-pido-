#!/usr/bin/env sh
# Gera dist-hostinger/lava-rapido.zip pronto para a hospedagem Node.js da Hostinger:
#   server.js + package.json + pocketbase (linux amd64) + pb_migrations + pb_hooks + pb_public (app)
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
VERSAO="${PB_VERSAO:-0.40.4}"
SAIDA="$RAIZ/dist-hostinger"
PACOTE="$SAIDA/pacote"
rm -rf "$SAIDA" && mkdir -p "$PACOTE"

echo "1/3 Compilando o app…"
cd "$RAIZ/web"
[ -d node_modules ] || npm ci
VITE_PB_URL="" npx vite build --outDir "$PACOTE/pb_public" --emptyOutDir >/dev/null

echo "2/3 Baixando o PocketBase $VERSAO (linux amd64)…"
curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${VERSAO}/pocketbase_${VERSAO}_linux_amd64.zip" -o "$SAIDA/pb.zip"
unzip -q -o "$SAIDA/pb.zip" pocketbase -d "$PACOTE"
rm "$SAIDA/pb.zip"
chmod +x "$PACOTE/pocketbase"

echo "3/3 Montando o pacote…"
cp "$RAIZ/deploy/hostinger/server.js" "$RAIZ/deploy/hostinger/package.json" "$PACOTE/"
cp -r "$RAIZ/pocketbase/pb_migrations" "$RAIZ/pocketbase/pb_hooks" "$PACOTE/"
cd "$PACOTE" && zip -qr "$SAIDA/lava-rapido.zip" .
echo "Pronto: $SAIDA/lava-rapido.zip ($(du -h "$SAIDA/lava-rapido.zip" | cut -f1))"
