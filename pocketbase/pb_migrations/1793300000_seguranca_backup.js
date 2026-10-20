/// <reference path="../pb_data/types.d.ts" />
// ETAPA 8 — Segurança e backup.
//
// 1. Remove a coleção "users" que o PocketBase cria sozinho. O app usa "usuarios";
//    a "users" ficava aberta para qualquer pessoa criar conta pela API.
// 2. Backup automático do PocketBase todo dia às 03:00 (Brasília), guardando os 7 últimos.
//    (Cópia fora do servidor: workflow backup-diario.yml no GitHub.)
migrate((app) => {
  try {
    const users = app.findCollectionByNameOrId("users");
    const qtd = app.countRecords("users");
    if (qtd === 0) {
      app.delete(users);
    } else {
      // Tem registros (não deveria): só tranca tudo.
      users.listRule = null;
      users.viewRule = null;
      users.createRule = null;
      users.updateRule = null;
      users.deleteRule = null;
      users.passwordAuth.enabled = false;
      app.save(users);
    }
  } catch (_) {}

  const settings = app.settings();
  settings.backups.cron = "0 6 * * *";
  settings.backups.cronMaxKeep = 7;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.backups.cron = "";
  app.save(settings);
});
