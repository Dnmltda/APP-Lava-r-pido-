/// <reference path="../pb_data/types.d.ts" />
// Pedido do Diego (23/10/2026): caminhão e veículos de transporte (vans, micro-ônibus, ônibus)
// também entram no lava rápido, com tamanho próprio. Sem preço próprio, são cobrados como carro grande.
// Carros já cadastrados não precisam mudar: o preço e as telas leem o tamanho pela tabela de modelos.
migrate((app) => {
  const veiculos = app.findCollectionByNameOrId("veiculos");
  veiculos.fields.getByName("porte").values = ["pequeno", "medio", "grande", "moto", "caminhao", "transporte"];
  app.save(veiculos);
}, (app) => {
  const veiculos = app.findCollectionByNameOrId("veiculos");
  for (const v of app.findAllRecords("veiculos")) {
    if (v.getString("porte") === "caminhao" || v.getString("porte") === "transporte") {
      v.set("porte", "grande");
      app.unsafeWithoutHooks().save(v);
    }
  }
  veiculos.fields.getByName("porte").values = ["pequeno", "medio", "grande", "moto"];
  app.save(veiculos);
});
