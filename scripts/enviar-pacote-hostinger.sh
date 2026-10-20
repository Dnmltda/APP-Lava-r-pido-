#!/usr/bin/env sh
# Envia dist-hostinger/lava-rapido.zip para a pasta do site na Hostinger (protocolo TUS).
# Uso: enviar-pacote-hostinger.sh URL AUTH_KEY REST_AUTH_KEY
# (URL e chaves vêm da operação "Generate upload URL" da API da Hostinger.)
set -e
URL="$1"; A="$2"; R="$3"
ZIP="$(cd "$(dirname "$0")/.." && pwd)/dist-hostinger/lava-rapido.zip"
SIZE=$(stat -c%s "$ZIP")
curl -fsS -o /dev/null -X POST "$URL/lava-rapido.zip?override=true" -H "X-Auth: $A" -H "X-Auth-Rest: $R" \
  -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $SIZE" -H "Upload-Offset: 0"
OFF=$(curl -fsS -D - -o /dev/null -X PATCH "$URL/lava-rapido.zip?override=true" -H "X-Auth: $A" -H "X-Auth-Rest: $R" \
  -H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" -H "Upload-Offset: 0" \
  --data-binary "@$ZIP" | grep -i '^upload-offset' | tr -dc '0-9')
[ "$OFF" = "$SIZE" ] && echo "Enviado: $SIZE bytes" || { echo "Envio incompleto: $OFF de $SIZE"; exit 1; }
