/// <reference path="../pb_data/types.d.ts" />
// Pedidos do Diego (20/10/2026):
//  1. O carro já diz o tamanho: veiculos.porte (pequeno | medio | grande | moto) e
//     veiculos.app_motorista (o cliente declara que trabalha com aplicativo). Na fila o
//     preço sai sozinho pelo tipo da empresa ligado a esse porte (tipos_veiculo[].vale).
//  2. Busca do carro só aparece se a empresa oferece (empresas.oferece_busca), sempre
//     avisando que tem taxa adicional.
migrate((app) => {
  const veiculos = app.findCollectionByNameOrId("veiculos");
  veiculos.fields.add(new SelectField({ name: "porte", maxSelect: 1, values: ["pequeno", "medio", "grande", "moto"] }));
  veiculos.fields.add(new BoolField({ name: "app_motorista" }));
  app.save(veiculos);

  const empresas = app.findCollectionByNameOrId("empresas");
  empresas.fields.add(new BoolField({ name: "oferece_busca" }));
  app.save(empresas);

  // Empresas que já existem continuam oferecendo a busca, como antes.
  for (const emp of app.findAllRecords("empresas")) {
    emp.set("oferece_busca", true);
    app.unsafeWithoutHooks().save(emp);
  }
}, (app) => {
  const v = app.findCollectionByNameOrId("veiculos");
  v.fields.removeByName("porte");
  v.fields.removeByName("app_motorista");
  app.save(v);
  const e = app.findCollectionByNameOrId("empresas");
  e.fields.removeByName("oferece_busca");
  app.save(e);
});
