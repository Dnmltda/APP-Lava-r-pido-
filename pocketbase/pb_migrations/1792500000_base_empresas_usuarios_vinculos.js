/// <reference path="../pb_data/types.d.ts" />
// ETAPA 1 — Base multiempresa.
// Cria: empresas, usuarios (auth por celular), vinculos (usuario ↔ empresa + papel)
// e auditoria (só leitura pelo patrão; ninguém edita ou apaga).
//
// Toda permissão fica nas regras de API (não só na tela). As regras usam
// @collection.vinculos com alias: condições que usam o MESMO alias são avaliadas
// na MESMA linha de vínculo (usuário + empresa + papel + ativo).
migrate((app) => {
  // ---------------------------------------------------------------- empresas
  const empresas = new Collection({
    type: "base",
    name: "empresas",
    fields: [
      { type: "text", name: "nome", required: true, max: 120 },
      // Endereço do link/QR do lava rápido: /<slug>
      { type: "text", name: "slug", required: true, min: 3, max: 40, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
      {
        type: "file", name: "logo", maxSelect: 1, maxSize: 2 * 1024 * 1024,
        mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
        thumbs: ["128x128", "256x0"],
      },
      { type: "text", name: "cor_principal", max: 7, pattern: "^#[0-9a-fA-F]{6}$" },
      { type: "text", name: "whatsapp", max: 13, pattern: "^[0-9]{10,13}$" },
      { type: "text", name: "endereco", max: 300 },
      { type: "number", name: "capacidade_simultanea", min: 1, max: 20, onlyInt: true },
      { type: "number", name: "tolerancia_min", min: 0, max: 120, onlyInt: true },
      { type: "number", name: "aviso_min", min: 0, max: 240, onlyInt: true },
      { type: "json", name: "textos_aviso", maxSize: 20000 },
      { type: "json", name: "horario_funcionamento", maxSize: 20000 },
      { type: "bool", name: "ativo" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_empresas_slug ON empresas (slug)"],
  });
  app.save(empresas);

  // ---------------------------------------------------------------- usuarios
  const usuarios = new Collection({
    type: "auth",
    name: "usuarios",
    fields: [
      { type: "text", name: "nome", required: true, max: 120 },
      // Só dígitos, com DDD: 11987654321
      { type: "text", name: "celular", required: true, pattern: "^[0-9]{10,11}$" },
      { type: "bool", name: "aceite_marketing" },
      { type: "date", name: "aceite_marketing_em" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_usuarios_celular ON usuarios (celular)"],
    passwordAuth: { enabled: true, identityFields: ["celular"] },
    authAlert: { enabled: false },
  });
  app.save(usuarios);
  // Login é por celular; e-mail não é usado na Fase 1.
  const emailField = usuarios.fields.getByName("email");
  if (emailField) {
    emailField.required = false;
    app.save(usuarios);
  }

  // ---------------------------------------------------------------- vinculos
  const vinculos = new Collection({
    type: "base",
    name: "vinculos",
    fields: [
      { type: "relation", name: "usuario", required: true, collectionId: usuarios.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "papel", required: true, maxSelect: 1, values: ["patrao", "gerente", "funcionario", "cliente"] },
      { type: "bool", name: "responsavel_fila" },
      { type: "bool", name: "ativo" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_vinculos_usuario_empresa ON vinculos (usuario, empresa)",
      "CREATE INDEX idx_vinculos_empresa_papel ON vinculos (empresa, papel)",
    ],
  });
  app.save(vinculos);

  // --------------------------------------------------------------- auditoria
  const auditoria = new Collection({
    type: "base",
    name: "auditoria",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1 },
      { type: "relation", name: "usuario", collectionId: usuarios.id, maxSelect: 1 },
      { type: "text", name: "acao", required: true, max: 60 },
      { type: "text", name: "entidade", max: 60 },
      { type: "text", name: "entidade_id", max: 30 },
      { type: "json", name: "antes", maxSize: 100000 },
      { type: "json", name: "depois", maxSize: 100000 },
      { type: "text", name: "motivo", max: 500 },
      { type: "autodate", name: "criado_em", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_auditoria_empresa_criado ON auditoria (empresa, criado_em)"],
  });
  app.save(auditoria);

  // ------------------------------------------------------------------ regras
  // membro(alias, empresaExpr, papeis): usuário logado tem vínculo ATIVO com a
  // empresa e (se informado) um dos papéis.
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

  // empresas: dados básicos públicos (o cliente vê logo/cor antes de logar).
  empresas.listRule = "ativo = true || " + membro("eu", "id", ["patrao"]);
  empresas.viewRule = empresas.listRule;
  empresas.createRule = null; // só o admin do PocketBase (DNM&LTDA)
  empresas.deleteRule = null;
  empresas.updateRule = membro("eu", "id", ["patrao"]) +
    " && @request.body.slug:changed = false && @request.body.ativo:changed = false";
  app.save(empresas);

  // usuarios: o próprio; a equipe ativa vê as pessoas vinculadas à sua empresa.
  usuarios.listRule = "id = @request.auth.id || (" +
    '@request.auth.id != "" && ' +
    "@collection.vinculos:eu.usuario ?= @request.auth.id && " +
    "@collection.vinculos:eu.ativo ?= true && " +
    '@collection.vinculos:eu.papel ?!= "cliente" && ' +
    "@collection.vinculos:alvo.usuario ?= id && " +
    "@collection.vinculos:alvo.empresa ?= @collection.vinculos:eu.empresa)";
  usuarios.viewRule = usuarios.listRule;
  usuarios.createRule = null; // cadastro pela rota /api/lr/cadastro
  usuarios.updateRule = "id = @request.auth.id && @request.body.celular:changed = false";
  usuarios.deleteRule = null;
  usuarios.manageRule = null;
  app.save(usuarios);

  // vinculos: o próprio; patrão vê todos da empresa; equipe vê a equipe.
  vinculos.listRule = "usuario = @request.auth.id || " +
    membro("eu", "empresa", ["patrao"]) + " || " +
    '(papel != "cliente" && ' + membro("eu", "empresa", EQUIPE) + ")";
  vinculos.viewRule = vinculos.listRule;
  vinculos.createRule = null; // rotas /api/lr/entrar e /api/lr/equipe
  vinculos.deleteRule = null; // remover = desativar (mantém histórico)
  vinculos.updateRule = membro("eu", "empresa", ["patrao"]) +
    " && usuario != @request.auth.id" +
    ' && papel != "patrao"' +
    ' && @request.body.papel != "patrao"' +
    " && @request.body.usuario:changed = false" +
    " && @request.body.empresa:changed = false";
  app.save(vinculos);

  // auditoria: só o patrão lê; ninguém cria/edita/apaga pela API.
  auditoria.listRule = membro("eu", "empresa", ["patrao"]);
  auditoria.viewRule = auditoria.listRule;
  auditoria.createRule = null;
  auditoria.updateRule = null;
  auditoria.deleteRule = null;
  app.save(auditoria);
}, (app) => {
  for (const nome of ["auditoria", "vinculos", "usuarios", "empresas"]) {
    try {
      app.delete(app.findCollectionByNameOrId(nome));
    } catch (_) {}
  }
});
