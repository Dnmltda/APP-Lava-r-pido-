/// <reference path="../pb_data/types.d.ts" />
// ETAPA 3 — Regras da fila: reservas encaixadas, reposicionar, cancelar e substituir.
//
// `ordem` passa a aceitar decimais: encaixar uma reserva ou reposicionar um
// cliente entre as posições 3 e 4 grava ordem 3.5, sem mexer em mais ninguém.
migrate((app) => {
  const fila = app.findCollectionByNameOrId("fila_entradas");

  const ordem = fila.fields.getByName("ordem");
  ordem.onlyInt = false;

  // Previsão no momento em que a vez foi confirmada (para o relatório de atrasos).
  // previsao_inicio já existe e passa a ser gravado na confirmação.
  fila.fields.add(new DateField({ name: "chegada_prevista" }));
  fila.fields.add(new DateField({ name: "reposicionado_em" }));
  fila.fields.add(new TextField({ name: "substituido_por", max: 30 }));
  app.save(fila);
}, (app) => {
  const fila = app.findCollectionByNameOrId("fila_entradas");
  fila.fields.getByName("ordem").onlyInt = true;
  fila.fields.removeByName("chegada_prevista");
  fila.fields.removeByName("reposicionado_em");
  fila.fields.removeByName("substituido_por");
  app.save(fila);
});
