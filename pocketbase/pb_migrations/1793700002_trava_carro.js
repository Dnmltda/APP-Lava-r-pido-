/// <reference path="../pb_data/types.d.ts" />
// Segurança (pedido do Diego), motorista de app: depois de cadastrado, o carro não troca de placa nem de modelo.
// Assim um carro aprovado como motorista de app não "vira" outro carro. Errou? Remove e cadastra de novo.
migrate((app) => {
  const v = app.findCollectionByNameOrId("veiculos");
  v.updateRule = '@request.auth.id != "" && cliente = @request.auth.id && @request.body.cliente:changed = false' +
    " && @request.body.placa:changed = false && @request.body.final_placa:changed = false && @request.body.modelo:changed = false";
  app.save(v);
  // Entrada de quem diz ser motorista de app e ainda não foi aprovado: a equipe confere na hora.
  const fila = app.findCollectionByNameOrId("fila_entradas");
  fila.fields.add(new BoolField({ name: "app_conferir" }));
  app.save(fila);
}, (app) => {
  const fila = app.findCollectionByNameOrId("fila_entradas");
  fila.fields.removeByName("app_conferir");
  app.save(fila);
  const v = app.findCollectionByNameOrId("veiculos");
  v.updateRule = '@request.auth.id != "" && cliente = @request.auth.id && @request.body.cliente:changed = false';
  app.save(v);
});
