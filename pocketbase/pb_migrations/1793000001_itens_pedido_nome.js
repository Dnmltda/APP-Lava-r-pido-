/// <reference path="../pb_data/types.d.ts" />
// O cliente não lê a coleção produtos (tem estoque e comissão). Para ele ver o
// nome do que pediu, o item do pedido guarda o nome do produto no momento do pedido.
migrate((app) => {
  const itens = app.findCollectionByNameOrId("itens_pedido");
  itens.fields.add(new TextField({ name: "produto_nome", max: 80 }));
  app.save(itens);
  for (const r of app.findRecordsByFilter("itens_pedido", "produto_nome = ''", "", 0, 0)) {
    try {
      r.set("produto_nome", app.findRecordById("produtos", r.getString("produto")).getString("nome"));
      app.saveNoValidate(r);
    } catch (_) {}
  }
}, (app) => {
  const itens = app.findCollectionByNameOrId("itens_pedido");
  itens.fields.removeByName("produto_nome");
  app.save(itens);
});
