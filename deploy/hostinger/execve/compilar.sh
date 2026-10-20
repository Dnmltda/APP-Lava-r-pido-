#!/usr/bin/env sh
# Compila execve.node (linux x64). Precisa de gcc e dos cabeçalhos do Node (node_api.h).
set -e
cd "$(dirname "$0")"
INC="${NODE_INCLUDE:-$(dirname "$(dirname "$(readlink -f "$(which node)")")")/include/node}"
[ -f "$INC/node_api.h" ] || INC=/opt/node22/include/node
gcc -O2 -shared -fPIC -DNODE_GYP_MODULE_NAME=execve -I"$INC" -o execve.node execve.c
echo "Pronto: $(pwd)/execve.node"
