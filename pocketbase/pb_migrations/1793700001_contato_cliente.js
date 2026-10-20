/// <reference path="../pb_data/types.d.ts" />
// Pedido do Diego (20/10/2026): no cadastro o cliente pode informar e-mail e/ou rede social
// (opcional, para divulgação). Campos ocultos: só o próprio cliente (rota /api/lr/meu-contato)
// e quem vê a lista de clientes (dono ou quem ele liberar) enxergam.
migrate((app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.fields.add(new TextField({ name: "contato_email", max: 120, hidden: true }));
  usuarios.fields.add(new TextField({ name: "rede_social", max: 80, hidden: true }));
  app.save(usuarios);
}, (app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.fields.removeByName("contato_email");
  usuarios.fields.removeByName("rede_social");
  app.save(usuarios);
});
