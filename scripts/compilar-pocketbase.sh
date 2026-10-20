#!/usr/bin/env sh
# Compila o PocketBase do Lava Rápido (deploy/hostinger/pocketbase) e coloca em
# pocketbase/bin/pocketbase para desenvolvimento e testes. Precisa de Go 1.24+.
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
"$RAIZ/deploy/hostinger/pocketbase/compilar.sh" >/dev/null
mkdir -p "$RAIZ/pocketbase/bin"
cp "$RAIZ/deploy/hostinger/pocketbase/pocketbase" "$RAIZ/pocketbase/bin/pocketbase.novo"
mv -f "$RAIZ/pocketbase/bin/pocketbase.novo" "$RAIZ/pocketbase/bin/pocketbase"
echo "Pronto: $RAIZ/pocketbase/bin/pocketbase"
