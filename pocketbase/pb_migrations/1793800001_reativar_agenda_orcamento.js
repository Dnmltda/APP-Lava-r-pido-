/// <reference path="../pb_data/types.d.ts" />
// Pedidos do Diego (20/10/2026):
//  - Reativar clientes: quem passou de 30 dias sem voltar aparece para dono e gerente
//    (vinculos.reativacao_em = quando mandaram a última mensagem).
//  - Agendamento pelo cliente: o cliente PEDE dia e horário; a equipe confirma, sugere outro
//    horário, coloca na sequência da fila ou recusa. Só vira lugar na fila com a equipe.
//  - Orçamento (polimento etc.): o cliente pede; dono ou gerente respondem o valor; o cliente
//    aceita ou recusa; o valor aceito vai para o agendamento. Serviço "sob orçamento" não entra
//    direto na fila.
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");
  const usuarios = app.findCollectionByNameOrId("usuarios");
  const servicos = app.findCollectionByNameOrId("servicos");
  const veiculos = app.findCollectionByNameOrId("veiculos");
  const fila = app.findCollectionByNameOrId("fila_entradas");
  const vinculos = app.findCollectionByNameOrId("vinculos");
  const V = "@collection.vinculos:eu";
  const LOGIN = '@request.auth.id != ""';
  const membro = (emp, papeis) =>
    `${V}.usuario ?= @request.auth.id && ${V}.empresa ?= ${emp} && ${V}.ativo ?= true && (${papeis})`;
  const EQUIPE = `${V}.papel ?= "patrao" || ${V}.papel ?= "gerente" || ${V}.papel ?= "funcionario"`;
  const auto = [
    { type: "autodate", name: "created", onCreate: true },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  vinculos.fields.add(new DateField({ name: "reativacao_em" }));
  app.save(vinculos);
  servicos.fields.add(new BoolField({ name: "sob_orcamento" }));
  app.save(servicos);

  const orcamentos = new Collection({
    type: "base",
    name: "orcamentos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "cliente", required: true, collectionId: usuarios.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "veiculo", required: true, collectionId: veiculos.id, maxSelect: 1 },
      { type: "relation", name: "servico", collectionId: servicos.id, maxSelect: 1 },
      { type: "text", name: "descricao", required: true, min: 3, max: 600 },
      {
        type: "file", name: "fotos", maxSelect: 4, maxSize: 5 * 1024 * 1024, protected: true,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pedido", "respondido", "aceito", "recusado", "cancelado"] },
      { type: "number", name: "valor", min: 0 },
      { type: "number", name: "duracao_min", min: 0, onlyInt: true },
      { type: "text", name: "resposta", max: 600 },
      { type: "date", name: "validade" },
      { type: "relation", name: "respondido_por", collectionId: usuarios.id, maxSelect: 1 },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_orcamentos_empresa ON orcamentos (empresa, status)"],
  });
  orcamentos.listRule = `${LOGIN} && (cliente = @request.auth.id || (${membro("empresa", EQUIPE)}))`;
  orcamentos.viewRule = orcamentos.listRule;
  // O cliente cria com fotos (opcional) direto na coleção; o servidor confere tudo no hook.
  orcamentos.createRule = `${LOGIN} && @request.body.cliente = @request.auth.id && @request.body.status = "pedido"`;
  orcamentos.updateRule = null; // rotas /api/lr/orcamentos/...
  orcamentos.deleteRule = null;
  app.save(orcamentos);

  const agend = new Collection({
    type: "base",
    name: "agendamentos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "cliente", required: true, collectionId: usuarios.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "veiculos", required: true, collectionId: veiculos.id, maxSelect: 3 },
      { type: "relation", name: "servico", required: true, collectionId: servicos.id, maxSelect: 1 },
      { type: "relation", name: "orcamento", collectionId: orcamentos.id, maxSelect: 1 },
      { type: "date", name: "horario_pedido", required: true },
      { type: "text", name: "observacao", max: 300 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pedido", "confirmado", "recusado", "cancelado"] },
      { type: "date", name: "horario_confirmado" },
      { type: "select", name: "como", maxSelect: 1, values: ["no_horario", "outro_horario", "na_fila"] },
      { type: "text", name: "resposta", max: 300 },
      { type: "relation", name: "entradas", collectionId: fila.id, maxSelect: 3 },
      { type: "relation", name: "respondido_por", collectionId: usuarios.id, maxSelect: 1 },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_agendamentos_empresa ON agendamentos (empresa, status)"],
  });
  agend.listRule = `${LOGIN} && (cliente = @request.auth.id || (${membro("empresa", EQUIPE)}))`;
  agend.viewRule = agend.listRule;
  agend.createRule = null; // rotas /api/lr/agendar...
  agend.updateRule = null;
  agend.deleteRule = null;
  app.save(agend);
}, (app) => {
  for (const n of ["agendamentos", "orcamentos"]) {
    try {
      app.delete(app.findCollectionByNameOrId(n));
    } catch (_) {}
  }
  const v = app.findCollectionByNameOrId("vinculos");
  v.fields.removeByName("reativacao_em");
  app.save(v);
  const s = app.findCollectionByNameOrId("servicos");
  s.fields.removeByName("sob_orcamento");
  app.save(s);
});
