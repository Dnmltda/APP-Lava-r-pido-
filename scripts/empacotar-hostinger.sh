#!/usr/bin/env sh
# Gera dist-hostinger/lava-rapido.zip pronto para a hospedagem Node.js da Hostinger:
#   server.js + execve.node + package.json + pocketbase (linux amd64) + pb_migrations + pb_hooks + pb_public (app)
# Precisa de Go (PocketBase do Lava Rápido), gcc e dos cabeçalhos do Node (execve.node).
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SAIDA="$RAIZ/dist-hostinger"
PACOTE="$SAIDA/pacote"
rm -rf "$SAIDA" && mkdir -p "$PACOTE"

echo "1/3 Compilando o app…"
cd "$RAIZ/web"
[ -d node_modules ] || npm ci
VITE_PB_URL="" npx vite build --outDir "$PACOTE/pb_public" --emptyOutDir >/dev/null

echo "2/3 Compilando o PocketBase do Lava Rápido (linux amd64)…"
"$RAIZ/deploy/hostinger/pocketbase/compilar.sh" >/dev/null
cp "$RAIZ/deploy/hostinger/pocketbase/pocketbase" "$PACOTE/pocketbase"
chmod +x "$PACOTE/pocketbase"

echo "3/3 Montando o pacote…"
"$RAIZ/deploy/hostinger/execve/compilar.sh" >/dev/null
cp "$RAIZ/deploy/hostinger/execve/execve.node" "$PACOTE/"
cp "$RAIZ/deploy/hostinger/server.js" "$RAIZ/deploy/hostinger/package.json" "$PACOTE/"
cp -r "$RAIZ/pocketbase/pb_migrations" "$RAIZ/pocketbase/pb_hooks" "$PACOTE/"
cd "$PACOTE" && zip -qr "$SAIDA/lava-rapido.zip" .
echo "Pronto: $SAIDA/lava-rapido.zip ($(du -h "$SAIDA/lava-rapido.zip" | cut -f1))"
