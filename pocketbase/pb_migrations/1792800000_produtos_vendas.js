/// <reference path="../pb_data/types.d.ts" />
// ETAPA 4 — Produtos e vendas.
//
// produtos: catálogo da empresa (o cliente vê pela rota /api/lr/catalogo, sem
//   estoque nem comissão). itens_pedido: carrinho do cliente ao entrar na fila
//   = produtos a separar na ordem de serviço. vendas + vendas_itens: venda presa
//   ao login de quem vendeu; ao fechar fica bloqueada, baixa o estoque e calcula
//   a comissão. Correção só pelo patrão, com motivo, na auditoria.
// Nada disso é gravado direto pela API: tudo passa por pb_hooks/vendas.pb.js.
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");
  const usuarios = app.findCollectionByNameOrId("usuarios");
  const fila = app.findCollectionByNameOrId("fila_entradas");

  const membro = (alias, empresaExpr, papeis) => {
    const v = "@collection.vinculos:" + alias;
    let r = '@request.auth.id != "" && ' +
      v + ".usuario ?= @request.auth.id && " +
      v + ".empresa ?= " + empresaExpr + " && " +
      v + ".ativo ?= true";
    if (papeis && papeis.length) {
      r += " && (" + papeis.map((p) => v + '.papel ?= "' + p + '"').join(" || ") + ")";
    }
    return "(" + r + ")";
  };
  const EQUIPE = ["patrao", "gerente", "funcionario"];

  // Comissão por produto só vale se o patrão ligar na empresa.
  empresas.fields.add(new BoolField({ name: "comissao_ativa" }));
  app.save(empresas);

  // ---------------------------------------------------------------- produtos
  const produtos = new Collection({
    type: "base",
    name: "produtos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "nome", required: true, max: 80 },
      { type: "text", name: "descricao", max: 300 },
      {
        type: "file", name: "foto", maxSelect: 1, maxSize: 3 * 1024 * 1024,
        mimeTypes: ["image/png", "image/jpeg", "image/webp"], thumbs: ["200x200"],
      },
      { type: "number", name: "preco", min: 0 },
      { type: "number", name: "estoque", onlyInt: true },
      { type: "number", name: "estoque_minimo", min: 0, onlyInt: true },
      { type: "select", name: "comissao_tipo", maxSelect: 1, values: ["nenhuma", "fixo", "percentual"] },
      { type: "number", name: "comissao_valor", min: 0 },
      { type: "bool", name: "ativo" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_produtos_empresa ON produtos (empresa, ativo)"],
  });
  app.save(produtos);

  // ------------------------------------------------------------ itens_pedido
  const itensPedido = new Collection({
    type: "base",
    name: "itens_pedido",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1 },
      { type: "relation", name: "entrada", required: true, collectionId: fila.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "produto", required: true, collectionId: produtos.id, maxSelect: 1 },
      { type: "number", name: "quantidade", required: true, min: 1, max: 99, onlyInt: true },
      { type: "number", name: "preco_unitario", min: 0 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pendente", "separado", "em_falta"] },
      { type: "relation", name: "atualizado_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_itens_pedido_entrada ON itens_pedido (entrada)"],
  });
  app.save(itensPedido);

  // ------------------------------------------------------------------ vendas
  const vendas = new Collection({
    type: "base",
    name: "vendas",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1 },
      { type: "relation", name: "funcionario", required: true, collectionId: usuarios.id, maxSelect: 1 },
      { type: "relation", name: "entrada", collectionId: fila.id, maxSelect: 1 },
      { type: "select", name: "forma_pagamento", maxSelect: 1, values: ["cartao", "dinheiro", "pix"] },
      { type: "number", name: "total", min: 0 },
      { type: "number", name: "comissao_total", min: 0 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["aberta", "fechada", "corrigida", "descartada"] },
      { type: "date", name: "fechada_em" },
      { type: "date", name: "corrigida_em" },
      { type: "relation", name: "corrigida_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "text", name: "motivo_correcao", max: 500 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_vendas_empresa_fechada ON vendas (empresa, fechada_em)",
      "CREATE INDEX idx_vendas_funcionario ON vendas (funcionario, empresa)",
    ],
  });
  app.save(vendas);

  const vendasItens = new Collection({
    type: "base",
    name: "vendas_itens",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1 },
      { type: "relation", name: "venda", required: true, collectionId: vendas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "produto", required: true, collectionId: produtos.id, maxSelect: 1 },
      { type: "text", name: "produto_nome", max: 80 },
      { type: "number", name: "quantidade", required: true, min: 1, max: 999, onlyInt: true },
      { type: "number", name: "preco_unitario", min: 0 },
      { type: "number", name: "comissao_calculada", min: 0 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_vendas_itens_venda ON vendas_itens (venda)"],
  });
  app.save(vendasItens);

  // ------------------------------------------------------------------ regras
  // produtos: a equipe vê tudo (inclui estoque e comissão); o patrão edita.
  produtos.listRule = membro("eu", "empresa", EQUIPE);
  produtos.viewRule = produtos.listRule;
  produtos.createRule = membro("eu", "@request.body.empresa", ["patrao"]);
  produtos.updateRule = membro("eu", "empresa", ["patrao"]) + " && @request.body.empresa:changed = false";
  produtos.deleteRule = null; // desativar em vez de apagar
  app.save(produtos);

  // itens_pedido: equipe da empresa; o cliente vê os itens da própria entrada.
  itensPedido.listRule = "entrada.cliente = @request.auth.id || " + membro("eu", "empresa", EQUIPE);
  itensPedido.viewRule = itensPedido.listRule;
  itensPedido.createRule = null;
  itensPedido.updateRule = null;
  itensPedido.deleteRule = null;
  app.save(itensPedido);

  // vendas: patrão e gerente veem todas; cada um da equipe vê as próprias.
  vendas.listRule = membro("eu", "empresa", ["patrao", "gerente"]) +
    " || (funcionario = @request.auth.id && " + membro("eu2", "empresa", EQUIPE) + ")";
  vendas.viewRule = vendas.listRule;
  vendas.createRule = null;
  vendas.updateRule = null;
  vendas.deleteRule = null;
  app.save(vendas);

  vendasItens.listRule = membro("eu", "empresa", ["patrao", "gerente"]) +
    " || (venda.funcionario = @request.auth.id && " + membro("eu2", "empresa", EQUIPE) + ")";
  vendasItens.viewRule = vendasItens.listRule;
  vendasItens.createRule = null;
  vendasItens.updateRule = null;
  vendasItens.deleteRule = null;
  app.save(vendasItens);
}, (app) => {
  for (const nome of ["vendas_itens", "vendas", "itens_pedido", "produtos"]) {
    try {
      app.delete(app.findCollectionByNameOrId(nome));
    } catch (_) {}
  }
  const empresas = app.findCollectionByNameOrId("empresas");
  empresas.fields.removeByName("comissao_ativa");
  app.save(empresas);
});
