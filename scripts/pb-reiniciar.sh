#!/usr/bin/env sh
# Reinicia o PocketBase de desenvolvimento em segundo plano (zera os limites de tentativas).
cd "$(dirname "$0")/../pocketbase"
[ -f pb_data/pb.pid ] && kill "$(cat pb_data/pb.pid)" 2>/dev/null && sleep 1
mkdir -p pb_data
nohup ./bin/pocketbase serve --dir ./pb_data --migrationsDir ./pb_migrations --hooksDir ./pb_hooks --http 127.0.0.1:8090 > pb_data/servidor.log 2>&1 &
echo $! > pb_data/pb.pid
sleep 2
tail -n 5 pb_data/servidor.log
