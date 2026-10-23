/// <reference path="../pb_data/types.d.ts" />
// Pedido do Diego (23/10/2026): cada lava rápido ajusta o tamanho dos modelos na tabela
// (ex.: "Strada é médio aqui"). empresas.tamanhos_modelos = { "Strada": "medio", ... }.
// Só o dono altera (regra de update da empresa + validação no hook). O tamanho gravado no
// carro do cliente (veiculos.porte) não muda: o ajuste vale só para o preço neste lava rápido.
// E sem limite de carros por cliente: o pedido de horário aceita até 30 carros (trava técnica).
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");
  empresas.fields.add(new JSONField({ name: "tamanhos_modelos", maxSize: 50000 }));
  app.save(empresas);

  const ag = app.findCollectionByNameOrId("agendamentos");
  for (const nome of ["veiculos", "entradas"]) ag.fields.getByName(nome).maxSelect = 30;
  app.save(ag);
}, (app) => {
  const e = app.findCollectionByNameOrId("empresas");
  e.fields.removeByName("tamanhos_modelos");
  app.save(e);
  const ag = app.findCollectionByNameOrId("agendamentos");
  for (const nome of ["veiculos", "entradas"]) ag.fields.getByName(nome).maxSelect = 3;
  app.save(ag);
});
