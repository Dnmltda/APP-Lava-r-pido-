/// <reference path="../pb_data/types.d.ts" />
// Pedido do Diego (20/10/2026): planos (pacotes) e cartão fidelidade.
//  - planos: o DONO cria e muda (nome, preço, validade, quantas lavagens, serviços incluídos).
//    Os clientes logados veem os planos ativos.
//  - assinaturas: o cliente PEDE um plano para um carro; o dono ATIVA depois de receber no balcão
//    (entra no caixa) ou recusa. Cada plano vale para um carro só.
//  - Na fila, quem gere a fila usa uma lavagem do plano (o serviço do dia sai R$ 0).
//  - Cartão fidelidade (opcional, por empresa): a cada N lavagens, um prêmio que o dono descreve.
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");
  const usuarios = app.findCollectionByNameOrId("usuarios");
  const servicos = app.findCollectionByNameOrId("servicos");
  const veiculos = app.findCollectionByNameOrId("veiculos");
  const fila = app.findCollectionByNameOrId("fila_entradas");
  const V = "@collection.vinculos:eu";
  const LOGIN = '@request.auth.id != ""';
  const membro = (emp, papeis) =>
    `${V}.usuario ?= @request.auth.id && ${V}.empresa ?= ${emp} && ${V}.ativo ?= true && (${papeis})`;
  const EQUIPE = `${V}.papel ?= "patrao" || ${V}.papel ?= "gerente" || ${V}.papel ?= "funcionario"`;
  const PATRAO = `${V}.papel ?= "patrao"`;
  const auto = [
    { type: "autodate", name: "created", onCreate: true },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  const planos = new Collection({
    type: "base",
    name: "planos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "nome", required: true, min: 2, max: 60 },
      { type: "text", name: "descricao", max: 500 },
      { type: "number", name: "preco", required: true, min: 0.01 },
      { type: "number", name: "validade_dias", required: true, min: 1, max: 366, onlyInt: true },
      { type: "number", name: "lavagens", required: true, min: 1, max: 100, onlyInt: true },
      { type: "relation", name: "servicos", collectionId: servicos.id, maxSelect: 20 },
      { type: "bool", name: "ativo" },
      { type: "number", name: "ordem", onlyInt: true },
      ...auto,
    ],
  });
  planos.listRule = `${LOGIN} && ((ativo = true && empresa.ativo = true) || (${membro("empresa", EQUIPE)}))`;
  planos.viewRule = planos.listRule;
  planos.createRule = `${LOGIN} && ${membro("@request.body.empresa", PATRAO)}`;
  planos.updateRule = `${LOGIN} && ${membro("empresa", PATRAO)} && @request.body.empresa:changed = false`;
  planos.deleteRule = null; // desativar em vez de apagar
  app.save(planos);

  const assinaturas = new Collection({
    type: "base",
    name: "assinaturas",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "cliente", required: true, collectionId: usuarios.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "veiculo", required: true, collectionId: veiculos.id, maxSelect: 1 },
      { type: "relation", name: "plano", required: true, collectionId: planos.id, maxSelect: 1 },
      { type: "text", name: "plano_nome", max: 60 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pedido", "ativa", "recusada", "cancelada"] },
      { type: "number", name: "lavagens_total", onlyInt: true, min: 0 },
      { type: "number", name: "lavagens_usadas", onlyInt: true, min: 0 },
      { type: "number", name: "valor_pago", min: 0 },
      { type: "text", name: "forma_pagamento", max: 20 },
      { type: "date", name: "inicio" },
      { type: "date", name: "fim" },
      { type: "relation", name: "decidido_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "text", name: "motivo", max: 300 },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_assinaturas_empresa ON assinaturas (empresa, status)"],
  });
  assinaturas.listRule = `${LOGIN} && (cliente = @request.auth.id || (${membro("empresa", EQUIPE)}))`;
  assinaturas.viewRule = assinaturas.listRule;
  assinaturas.createRule = null; // rotas /api/lr/planos/...
  assinaturas.updateRule = null;
  assinaturas.deleteRule = null;
  app.save(assinaturas);

  // Entrada da fila paga com plano ou com prêmio de fidelidade.
  fila.fields.add(new RelationField({ name: "assinatura", collectionId: assinaturas.id, maxSelect: 1 }));
  fila.fields.add(new BoolField({ name: "premio_fidelidade" }));
  fila.fields.add(new NumberField({ name: "preco_tabela", min: 0 })); // preço antes do plano/prêmio
  app.save(fila);

  empresas.fields.add(new BoolField({ name: "fidelidade_ativa" }));
  empresas.fields.add(new NumberField({ name: "fidelidade_meta", min: 0, max: 100, onlyInt: true }));
  empresas.fields.add(new TextField({ name: "fidelidade_premio", max: 120 }));
  app.save(empresas);
}, (app) => {
  const fila = app.findCollectionByNameOrId("fila_entradas");
  for (const f of ["assinatura", "premio_fidelidade", "preco_tabela"]) fila.fields.removeByName(f);
  app.save(fila);
  const empresas = app.findCollectionByNameOrId("empresas");
  for (const f of ["fidelidade_ativa", "fidelidade_meta", "fidelidade_premio"]) empresas.fields.removeByName(f);
  app.save(empresas);
  for (const n of ["assinaturas", "planos"]) {
    try {
      app.delete(app.findCollectionByNameOrId(n));
    } catch (_) {}
  }
});
