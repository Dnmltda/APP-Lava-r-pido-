/// <reference path="../pb_data/types.d.ts" />
// Cadastros por hora vindos do mesmo endereço de internet: 5 → 20.
// Várias pessoas testando (ou clientes no Wi-Fi do lava rápido) saem pelo mesmo IP.
migrate((app) => {
  const settings = app.settings();
  for (const r of settings.rateLimits.rules || []) {
    if (r.label === "POST /api/lr/cadastro") r.maxRequests = 20;
  }
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  for (const r of settings.rateLimits.rules || []) {
    if (r.label === "POST /api/lr/cadastro") r.maxRequests = 5;
  }
  app.save(settings);
});
