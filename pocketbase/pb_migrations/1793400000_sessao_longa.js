/// <reference path="../pb_data/types.d.ts" />
// Login lembrado: a sessão dura 60 dias (e é renovada toda vez que o app abre),
// para ninguém precisar digitar a senha toda hora no dia a dia corrido.
// Se o patrão trocar a senha de alguém, a sessão dele cai na hora; pessoa desativada perde o acesso pelas regras.
migrate((app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.authToken.duration = 60 * 86400;
  app.save(usuarios);
}, (app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.authToken.duration = 7 * 86400;
  app.save(usuarios);
});
