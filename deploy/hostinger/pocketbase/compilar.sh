#!/usr/bin/env sh
# Compila o PocketBase do Lava Rápido (linux amd64, sem CGO).
set -e
cd "$(dirname "$0")"
GOFLAGS=-mod=mod go mod tidy >/dev/null 2>&1
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o pocketbase .
echo "Pronto: $(pwd)/pocketbase"
