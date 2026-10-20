/// <reference path="../pb_data/types.d.ts" />
// Limite geral da API por endereço de internet: 300 → 600 pedidos por minuto.
// No lava rápido, equipe e clientes no mesmo Wi-Fi saem pelo mesmo IP, e cada
// celular com a fila aberta consulta o servidor a cada 10 s.
migrate((app) => {
  const settings = app.settings();
  for (const r of settings.rateLimits.rules || []) if (r.label === "/api/") r.maxRequests = 600;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  for (const r of settings.rateLimits.rules || []) if (r.label === "/api/") r.maxRequests = 300;
  app.save(settings);
});
