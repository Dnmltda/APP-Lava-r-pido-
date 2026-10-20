/// <reference path="../pb_data/types.d.ts" />
// Configurações gerais: nome do app, limite de tentativas de login e
// cabeçalhos de proxy confiáveis (Fly.io / Cloudflare / Nginx).
migrate((app) => {
  const settings = app.settings();

  settings.meta.appName = "DNM&LTDA Lava Rápido";
  settings.meta.hideControls = true;

  settings.logs.maxDays = 7;
  settings.logs.logIP = true;

  settings.trustedProxy.headers = ["X-Real-IP", "X-Forwarded-For", "CF-Connecting-IP", "Fly-Client-IP"];

  settings.rateLimits = {
    enabled: true,
    rules: [
      // Limite geral da API
      { label: "/api/", audience: "", duration: 60, maxRequests: 300 },
      // Tentativas de login: 10 a cada 5 minutos por IP
      { label: "*:auth", audience: "@guest", duration: 5 * 60, maxRequests: 10 },
      // Cadastro de cliente: 5 por hora por IP
      { label: "POST /api/lr/cadastro", audience: "", duration: 60 * 60, maxRequests: 5 },
    ],
  };

  app.save(settings);
});
