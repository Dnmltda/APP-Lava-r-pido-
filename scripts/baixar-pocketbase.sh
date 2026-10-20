#!/usr/bin/env sh
# Baixa o PocketBase na versão usada pelo projeto para pocketbase/bin/.
set -e
VERSAO="${PB_VERSAO:-0.40.4}"
case "$(uname -s)" in Linux) SO=linux ;; Darwin) SO=darwin ;; *) SO=windows ;; esac
case "$(uname -m)" in x86_64|amd64) ARQ=amd64 ;; arm64|aarch64) ARQ=arm64 ;; *) ARQ=amd64 ;; esac
DESTINO="$(dirname "$0")/../pocketbase/bin"
mkdir -p "$DESTINO"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSAO}/pocketbase_${VERSAO}_${SO}_${ARQ}.zip"
echo "Baixando $URL"
curl -fsSL "$URL" -o /tmp/pocketbase.zip
unzip -o /tmp/pocketbase.zip pocketbase pocketbase.exe -d "$DESTINO" 2>/dev/null || unzip -o /tmp/pocketbase.zip -d "$DESTINO"
rm /tmp/pocketbase.zip
echo "Pronto: $DESTINO"
