/// <reference path="../pb_data/types.d.ts" />
// ETAPA 5 — Painéis: caixa (gastos/entradas), metas, regra de bônus, vales e holerites.
//
// Quem vê o quê (tabela 1.3):
//   caixa e metas: patrão edita, gerente só lê.
//   regra de bônus: só o patrão (o funcionário vê só o PRÓPRIO bônus estimado,
//     calculado no servidor pela rota /api/lr/minha-area).
//   vales e holerites: o patrão lança; cada pessoa da equipe vê só os seus.
//     Comprovante e holerite são arquivos PROTEGIDOS (precisam de token e da
//     mesma regra de leitura do registro).
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");
  const usuarios = app.findCollectionByNameOrId("usuarios");

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
  const DIRECAO = ["patrao", "gerente"];
  const auto = [
    { type: "autodate", name: "created", onCreate: true },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  // ------------------------------------------------------- lancamentos_caixa
  const caixa = new Collection({
    type: "base",
    name: "lancamentos_caixa",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "date", name: "data", required: true },
      { type: "select", name: "tipo", required: true, maxSelect: 1, values: ["entrada", "saida"] },
      { type: "text", name: "categoria", required: true, max: 60 },
      { type: "number", name: "valor", required: true, min: 0.01 },
      { type: "text", name: "descricao", max: 300 },
      { type: "relation", name: "criado_por", required: true, collectionId: usuarios.id, maxSelect: 1 },
      { type: "bool", name: "cancelado" },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_caixa_empresa_data ON lancamentos_caixa (empresa, data)"],
  });
  app.save(caixa);

  // ------------------------------------------------------------------ metas
  const metas = new Collection({
    type: "base",
    name: "metas",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "periodo", required: true, maxSelect: 1, values: ["dia", "mes"] },
      { type: "number", name: "valor", required: true, min: 0 },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_metas_empresa_periodo ON metas (empresa, periodo)"],
  });
  app.save(metas);

  // ------------------------------------------------------------ regras_bonus
  const bonus = new Collection({
    type: "base",
    name: "regras_bonus",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "valor_por_carro", required: true, min: 0 },
      { type: "bool", name: "ativo" },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_regras_bonus_empresa ON regras_bonus (empresa)"],
  });
  app.save(bonus);

  // ------------------------------------------------------------------ vales
  const vales = new Collection({
    type: "base",
    name: "vales",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "funcionario", required: true, collectionId: usuarios.id, maxSelect: 1 },
      { type: "number", name: "valor", required: true, min: 0.01 },
      { type: "date", name: "data", required: true },
      {
        type: "file", name: "comprovante", maxSelect: 1, maxSize: 5 * 1024 * 1024, protected: true,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      },
      { type: "text", name: "observacao", max: 300 },
      { type: "relation", name: "lancado_por", required: true, collectionId: usuarios.id, maxSelect: 1 },
      { type: "bool", name: "cancelado" },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_vales_empresa_func ON vales (empresa, funcionario, data)"],
  });
  app.save(vales);

  // -------------------------------------------------------------- holerites
  const holerites = new Collection({
    type: "base",
    name: "holerites",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "funcionario", required: true, collectionId: usuarios.id, maxSelect: 1 },
      // "2026-10"
      { type: "text", name: "competencia", required: true, pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
      {
        type: "file", name: "arquivo", required: true, maxSelect: 1, maxSize: 10 * 1024 * 1024, protected: true,
        mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      },
      { type: "relation", name: "lancado_por", required: true, collectionId: usuarios.id, maxSelect: 1 },
      ...auto,
    ],
    indexes: ["CREATE INDEX idx_holerites_empresa_func ON holerites (empresa, funcionario, competencia)"],
  });
  app.save(holerites);

  // ------------------------------------------------------------------ regras
  // O funcionário/gerente lançado precisa ser da equipe ativa da MESMA empresa.
  const daEquipe = (campo) =>
    "@collection.vinculos:alvo.usuario ?= " + campo + " && @collection.vinculos:alvo.empresa ?= @request.body.empresa" +
    ' && @collection.vinculos:alvo.papel ?!= "cliente"';

  caixa.listRule = membro("eu", "empresa", DIRECAO);
  caixa.viewRule = caixa.listRule;
  caixa.createRule = membro("eu", "@request.body.empresa", ["patrao"]) + " && @request.body.criado_por = @request.auth.id";
  caixa.updateRule = membro("eu", "empresa", ["patrao"]) +
    " && @request.body.empresa:changed = false && @request.body.criado_por:changed = false";
  caixa.deleteRule = null; // cancelar em vez de apagar
  app.save(caixa);

  metas.listRule = membro("eu", "empresa", DIRECAO);
  metas.viewRule = metas.listRule;
  metas.createRule = membro("eu", "@request.body.empresa", ["patrao"]);
  metas.updateRule = membro("eu", "empresa", ["patrao"]) + " && @request.body.empresa:changed = false";
  metas.deleteRule = null;
  app.save(metas);

  bonus.listRule = membro("eu", "empresa", ["patrao"]);
  bonus.viewRule = bonus.listRule;
  bonus.createRule = membro("eu", "@request.body.empresa", ["patrao"]);
  bonus.updateRule = membro("eu", "empresa", ["patrao"]) + " && @request.body.empresa:changed = false";
  bonus.deleteRule = null;
  app.save(bonus);

  for (const c of [vales, holerites]) {
    c.listRule = membro("eu", "empresa", ["patrao"]) + " || (funcionario = @request.auth.id && " + membro("eu2", "empresa", EQUIPE) + ")";
    c.viewRule = c.listRule;
    c.createRule = membro("eu", "@request.body.empresa", ["patrao"]) +
      " && @request.body.lancado_por = @request.auth.id && " + daEquipe("@request.body.funcionario");
    c.updateRule = membro("eu", "empresa", ["patrao"]) +
      " && @request.body.empresa:changed = false && @request.body.funcionario:changed = false && @request.body.lancado_por:changed = false";
    c.deleteRule = null;
    app.save(c);
  }
}, (app) => {
  for (const nome of ["holerites", "vales", "regras_bonus", "metas", "lancamentos_caixa"]) {
    try {
      app.delete(app.findCollectionByNameOrId(nome));
    } catch (_) {}
  }
});
