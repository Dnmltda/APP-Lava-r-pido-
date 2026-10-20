/// <reference path="../pb_data/types.d.ts" />
// Pedidos do Diego (20/10/2026):
//  1. vistorias      — fotos de ANTES e DEPOIS do carro (opcional). Só dono, gerente e
//                      funcionário responsável pela fila tiram. Equipe e o cliente do carro veem.
//                      Não se apaga nem se edita (é prova).
//  2. gastos_fixos   — gastos que se repetem todo mês (aluguel, luz…). Entram sozinhos no caixa.
//  3. fechamentos_dia — fechamento do dia pelo gerente/dono: valores conferidos das maquininhas
//                      e do dinheiro + notas anexadas (fotos ou PDF). O dono acompanha.
//  4. tipos de veículo e preços — cada empresa cria os tipos (pequeno, grande, moto, motorista
//                      de app, convênio…); cada serviço pode ter preço por tipo. Tipos "restritos"
//                      (ex.: Uber, convênio) só a equipe define.
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");
  const usuarios = app.findCollectionByNameOrId("usuarios");
  const fila = app.findCollectionByNameOrId("fila_entradas");
  const caixa = app.findCollectionByNameOrId("lancamentos_caixa");
  const V = "@collection.vinculos:eu";
  const membro = (empresaExpr, papeis) =>
    `@request.auth.id != "" && ${V}.usuario ?= @request.auth.id && ${V}.empresa ?= ${empresaExpr} && ${V}.ativo ?= true && (${papeis})`;
  const EQUIPE = `${V}.papel ?= "patrao" || ${V}.papel ?= "gerente" || ${V}.papel ?= "funcionario"`;
  const FOTOS = `${V}.papel ?= "patrao" || ${V}.papel ?= "gerente" || (${V}.papel ?= "funcionario" && ${V}.responsavel_fila ?= true)`;
  const VALORES = `${V}.papel ?= "patrao" || ${V}.papel ?= "gerente" || (${V}.papel ?= "funcionario" && ${V}.perm_valores ?= true)`;
  const DIRECAO = `${V}.papel ?= "patrao" || ${V}.papel ?= "gerente"`;
  const PATRAO = `${V}.papel ?= "patrao"`;
  const auto = [
    { type: "autodate", name: "created", onCreate: true },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  // 1. vistorias -------------------------------------------------------------
  const vistorias = new Collection({
    type: "base",
    name: "vistorias",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "entrada", required: true, collectionId: fila.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "momento", required: true, maxSelect: 1, values: ["antes", "depois"] },
      {
        type: "file", name: "fotos", required: true, maxSelect: 8, maxSize: 5 * 1024 * 1024, protected: true,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["400x0"],
      },
      { type: "text", name: "avarias", max: 500 },
      { type: "relation", name: "criado_por", required: true, collectionId: usuarios.id, maxSelect: 1 },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_vistorias_entrada ON vistorias (entrada)"],
  });
  vistorias.listRule = `@request.auth.id != "" && (entrada.cliente = @request.auth.id || (${membro("empresa", EQUIPE)}))`;
  vistorias.viewRule = vistorias.listRule;
  vistorias.createRule = `${membro("@request.body.empresa", FOTOS)} && @request.body.entrada.empresa = @request.body.empresa && @request.body.criado_por = @request.auth.id`;
  vistorias.updateRule = null;
  vistorias.deleteRule = null;
  app.save(vistorias);

  // 2. gastos fixos ----------------------------------------------------------
  const fixos = new Collection({
    type: "base",
    name: "gastos_fixos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "descricao", required: true, max: 100 },
      { type: "text", name: "categoria", required: true, max: 60 },
      { type: "number", name: "valor", required: true, min: 0.01 },
      { type: "number", name: "dia", required: true, min: 1, max: 28, onlyInt: true },
      { type: "bool", name: "ativo" },
      { type: "relation", name: "criado_por", required: true, collectionId: usuarios.id, maxSelect: 1 },
      ...auto,
    ],
  });
  fixos.listRule = membro("empresa", VALORES);
  fixos.viewRule = fixos.listRule;
  fixos.createRule = `${membro("@request.body.empresa", PATRAO)} && @request.body.criado_por = @request.auth.id`;
  fixos.updateRule = `${membro("empresa", PATRAO)} && @request.body.empresa:changed = false && @request.body.criado_por:changed = false`;
  fixos.deleteRule = null; // desativar em vez de apagar
  app.save(fixos);

  // lançamento gerado por um gasto fixo: um por mês (competência AAAA-MM)
  caixa.fields.add(new RelationField({ name: "gasto_fixo", collectionId: fixos.id, maxSelect: 1 }));
  caixa.fields.add(new TextField({ name: "competencia", max: 7 }));
  caixa.indexes.push("CREATE UNIQUE INDEX idx_caixa_fixo_mes ON lancamentos_caixa (gasto_fixo, competencia) WHERE gasto_fixo != ''");
  app.save(caixa);

  // 3. fechamento do dia ------------------------------------------------------
  const fech = new Collection({
    type: "base",
    name: "fechamentos_dia",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "dia", required: true, min: 10, max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { type: "number", name: "cartao", min: 0 },
      { type: "number", name: "pix", min: 0 },
      { type: "number", name: "dinheiro", min: 0 },
      { type: "text", name: "observacao", max: 1000 },
      {
        type: "file", name: "anexos", maxSelect: 20, maxSize: 10 * 1024 * 1024, protected: true,
        mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], thumbs: ["400x0"],
      },
      { type: "relation", name: "criado_por", required: true, collectionId: usuarios.id, maxSelect: 1 },
      { type: "relation", name: "atualizado_por", collectionId: usuarios.id, maxSelect: 1 },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_fechamento_dia ON fechamentos_dia (empresa, dia)"],
  });
  fech.listRule = membro("empresa", VALORES);
  fech.viewRule = fech.listRule;
  fech.createRule = `${membro("@request.body.empresa", DIRECAO)} && @request.body.criado_por = @request.auth.id`;
  fech.updateRule = `${membro("empresa", DIRECAO)} && @request.body.empresa:changed = false && @request.body.dia:changed = false && @request.body.criado_por:changed = false`;
  fech.deleteRule = null;
  app.save(fech);

  // 4. tipos de veículo e preço por tipo ----------------------------------------
  empresas.fields.add(new JSONField({ name: "tipos_veiculo", maxSize: 20000 })); // [{id, nome, restrito}]
  app.save(empresas);
  const servicos = app.findCollectionByNameOrId("servicos");
  servicos.fields.add(new JSONField({ name: "precos_tipo", maxSize: 20000 })); // {tipoId: preço}
  app.save(servicos);
  fila.fields.add(new TextField({ name: "tipo_veiculo", max: 20 }));
  fila.fields.add(new TextField({ name: "tipo_veiculo_nome", max: 60 }));
  app.save(fila);
  // tipo que a EQUIPE definiu para cada veículo do cliente (vale para as próximas vezes)
  const vinculos = app.findCollectionByNameOrId("vinculos");
  vinculos.fields.add(new JSONField({ name: "tipos_veiculos", maxSize: 20000 })); // {veiculoId: tipoId}
  app.save(vinculos);
}, (app) => {
  for (const n of ["vistorias", "fechamentos_dia"]) {
    try {
      app.delete(app.findCollectionByNameOrId(n));
    } catch (_) {}
  }
  const caixa = app.findCollectionByNameOrId("lancamentos_caixa");
  caixa.fields.removeByName("gasto_fixo");
  caixa.fields.removeByName("competencia");
  caixa.indexes = caixa.indexes.filter((i) => i.indexOf("idx_caixa_fixo_mes") < 0);
  app.save(caixa);
  try {
    app.delete(app.findCollectionByNameOrId("gastos_fixos"));
  } catch (_) {}
  const rm = (col, f) => {
    const c = app.findCollectionByNameOrId(col);
    c.fields.removeByName(f);
    app.save(c);
  };
  rm("empresas", "tipos_veiculo");
  rm("servicos", "precos_tipo");
  rm("fila_entradas", "tipo_veiculo");
  rm("fila_entradas", "tipo_veiculo_nome");
  rm("vinculos", "tipos_veiculos");
});
