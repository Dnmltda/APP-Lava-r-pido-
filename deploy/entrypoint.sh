#!/bin/sh
# Sobe o PocketBase. Os dados ficam no volume /pb/pb_data.
# PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (secrets do Fly) mantêm o admin da DNM&LTDA atualizado.
set -e
mkdir -p /pb/pb_data
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  /pb/pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" \
    --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations >/dev/null && echo "[entrypoint] admin ok"
fi
exec /pb/pocketbase serve \
  --http=0.0.0.0:8080 \
  --dir=/pb/pb_data \
  --migrationsDir=/pb/pb_migrations \
  --hooksDir=/pb/pb_hooks \
  --hooksWatch=false \
  --publicDir=/pb/pb_public
