/// <reference path="../pb_data/types.d.ts" />
// ETAPA 6 — Avisos (Web Push) e avaliação do cliente.
//
// push_inscricoes: cada celular/navegador que aceitou notificações (do próprio usuário).
// push_chaves: par de chaves VAPID do servidor (gerado sozinho; ninguém acessa pela API).
// avaliacoes: 1 por carro finalizado, feita pelo cliente. A equipe lê pela rota
//   /api/lr/avaliacoes SEM o nome do cliente; pela API direta só o patrão e o próprio cliente.
// fila_entradas ganha a marcação de quais avisos já foram enviados (para não repetir).
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

  // --------------------------------------------------------- push_inscricoes
  const inscricoes = new Collection({
    type: "base",
    name: "push_inscricoes",
    fields: [
      { type: "relation", name: "usuario", required: true, collectionId: usuarios.id, maxSelect: 1, cascadeDelete: true },
      { type: "url", name: "endpoint", required: true },
      { type: "text", name: "p256dh", required: true, max: 200 },
      { type: "text", name: "auth", required: true, max: 100 },
      { type: "text", name: "dispositivo", max: 200 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_push_endpoint ON push_inscricoes (endpoint)",
      "CREATE INDEX idx_push_usuario ON push_inscricoes (usuario)",
    ],
  });
  inscricoes.listRule = "usuario = @request.auth.id";
  inscricoes.viewRule = "usuario = @request.auth.id";
  inscricoes.createRule = '@request.auth.id != "" && @request.body.usuario = @request.auth.id';
  inscricoes.updateRule = null;
  inscricoes.deleteRule = "usuario = @request.auth.id";
  app.save(inscricoes);

  // ------------------------------------------------------------ push_chaves
  const chaves = new Collection({
    type: "base",
    name: "push_chaves",
    fields: [
      { type: "text", name: "publica", required: true, max: 200 },
      { type: "text", name: "privada", required: true, max: 200 },
      { type: "autodate", name: "created", onCreate: true },
    ],
  });
  // Sem regras: só o servidor (hooks) lê e grava.
  app.save(chaves);

  // -------------------------------------------------------------- avaliacoes
  const avaliacoes = new Collection({
    type: "base",
    name: "avaliacoes",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "entrada", required: true, collectionId: fila.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "cliente", required: true, collectionId: usuarios.id, maxSelect: 1 },
      { type: "relation", name: "funcionario", collectionId: usuarios.id, maxSelect: 1 },
      { type: "number", name: "nota_funcionario", required: true, min: 1, max: 5, onlyInt: true },
      { type: "number", name: "nota_atendimento", required: true, min: 1, max: 5, onlyInt: true },
      { type: "number", name: "nota_ambiente", required: true, min: 1, max: 5, onlyInt: true },
      { type: "text", name: "comentario", max: 500 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_avaliacoes_entrada ON avaliacoes (entrada)",
      "CREATE INDEX idx_avaliacoes_empresa ON avaliacoes (empresa, created)",
    ],
  });
  avaliacoes.listRule = "cliente = @request.auth.id || " + membro("eu", "empresa", ["patrao"]);
  avaliacoes.viewRule = avaliacoes.listRule;
  avaliacoes.createRule = null; // rota /api/lr/avaliar
  avaliacoes.updateRule = null;
  avaliacoes.deleteRule = null;
  app.save(avaliacoes);

  // ------------------------------------------------- avisos já enviados
  for (const nome of ["push_confirmado_em", "push_aviso_em", "push_pronto_em", "push_avaliacao_em"]) {
    fila.fields.add(new DateField({ name: nome }));
  }
  app.save(fila);
}, (app) => {
  for (const nome of ["avaliacoes", "push_chaves", "push_inscricoes"]) {
    try {
      app.delete(app.findCollectionByNameOrId(nome));
    } catch (_) {}
  }
  const fila = app.findCollectionByNameOrId("fila_entradas");
  for (const nome of ["push_confirmado_em", "push_aviso_em", "push_pronto_em", "push_avaliacao_em"]) {
    fila.fields.removeByName(nome);
  }
  app.save(fila);
});
