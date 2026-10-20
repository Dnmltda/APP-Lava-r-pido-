# DNM&LTDA Lava Rápido — imagem única: PocketBase servindo a API e o app (PWA).
# Mesmo modelo do APP OBRA: um endereço só, HTTPS pelo Fly.io.

# 1) Build do frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# VITE_PB_URL vazio = o app usa o próprio endereço como backend
ENV VITE_PB_URL=""
RUN npm run build

# 2) PocketBase
FROM alpine:3.20
ARG PB_VERSAO=0.40.4
RUN apk add --no-cache ca-certificates unzip wget tzdata \
 && wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSAO}/pocketbase_${PB_VERSAO}_linux_amd64.zip -O /tmp/pb.zip \
 && unzip /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip
ENV TZ=America/Sao_Paulo
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY pocketbase/pb_hooks /pb/pb_hooks
COPY --from=web /web/dist /pb/pb_public
COPY deploy/entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh /pb/pocketbase
EXPOSE 8080
ENTRYPOINT ["/pb/entrypoint.sh"]
