/// <reference path="../pb_data/types.d.ts" />
// ETAPA 2 — Fila: veículos, serviços, entradas da fila e sinal de tempo real.
//
// fila_entradas não é criada nem alterada direto pela API: tudo passa pelas
// rotas /api/lr/fila/* (pb_hooks/fila.pb.js), que aplicam a máquina de estados,
// as permissões por papel e registram a auditoria.
// fila_sinais tem 1 registro por empresa, atualizado a cada mudança na fila;
// qualquer celular (até sem login) assina esse registro e recarrega a visão
// pública, sem nunca receber dados pessoais pelo tempo real.
migrate((app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  const empresas = app.findCollectionByNameOrId("empresas");

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

  // ---------------------------------------------------------------- veiculos
  // Pertence ao cliente (um cliente pode usar vários lava rápidos).
  const veiculos = new Collection({
    type: "base",
    name: "veiculos",
    fields: [
      { type: "relation", name: "cliente", required: true, collectionId: usuarios.id, maxSelect: 1, cascadeDelete: true },
      // Placa completa opcional (antiga ABC1234 ou Mercosul ABC1D23)
      { type: "text", name: "placa", max: 7, pattern: "^$|^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$" },
      // 3 últimos caracteres da placa (o que aparece na fila pública)
      { type: "text", name: "final_placa", required: true, min: 3, max: 3, pattern: "^[A-Z0-9]{3}$" },
      { type: "text", name: "modelo", max: 60 },
      { type: "text", name: "cor", max: 30 },
      { type: "bool", name: "ativo" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_veiculos_cliente ON veiculos (cliente)"],
  });
  app.save(veiculos);

  // ---------------------------------------------------------------- servicos
  const servicos = new Collection({
    type: "base",
    name: "servicos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "nome", required: true, max: 80 },
      { type: "text", name: "descricao", max: 300 },
      { type: "number", name: "preco", min: 0 },
      { type: "number", name: "duracao_media_min", required: true, min: 1, max: 600, onlyInt: true },
      { type: "number", name: "ordem_exibicao", onlyInt: true },
      { type: "bool", name: "ativo" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_servicos_empresa ON servicos (empresa, ativo)"],
  });
  app.save(servicos);

  // ----------------------------------------------------------- fila_entradas
  const fila = new Collection({
    type: "base",
    name: "fila_entradas",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1 },
      { type: "relation", name: "cliente", collectionId: usuarios.id, maxSelect: 1 },
      { type: "relation", name: "veiculo", collectionId: veiculos.id, maxSelect: 1 },
      { type: "relation", name: "servico", required: true, collectionId: servicos.id, maxSelect: 1 },
      { type: "select", name: "origem", required: true, maxSelect: 1, values: ["app", "reserva", "balcao", "substituicao"] },
      { type: "number", name: "ordem", required: true, onlyInt: true },
      {
        type: "select", name: "status", required: true, maxSelect: 1,
        values: ["pendente", "confirmado", "avisado", "no_local", "lavando", "pronto", "finalizado", "recusado", "cancelado", "substituido"],
      },
      { type: "bool", name: "quer_busca" },
      { type: "text", name: "observacao", max: 300 },
      // Cliente de balcão (sem cadastro no app)
      { type: "text", name: "nome_avulso", max: 120 },
      { type: "text", name: "celular_avulso", max: 11 },
      { type: "text", name: "final_placa_avulsa", max: 3 },
      { type: "text", name: "veiculo_avulso", max: 90 },
      // Cópia do serviço no momento da entrada (preço/duração podem mudar depois)
      { type: "number", name: "duracao_min", onlyInt: true },
      { type: "number", name: "preco_servico", min: 0 },
      { type: "date", name: "horario_reserva" },
      { type: "date", name: "previsao_inicio" },
      { type: "relation", name: "confirmado_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "relation", name: "lavado_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "relation", name: "finalizado_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "date", name: "confirmado_em" },
      { type: "date", name: "avisado_em" },
      { type: "date", name: "chegada_em" },
      { type: "date", name: "inicio_em" },
      { type: "date", name: "pronto_em" },
      { type: "date", name: "finalizado_em" },
      { type: "date", name: "cancelado_em" },
      { type: "relation", name: "cancelado_por", collectionId: usuarios.id, maxSelect: 1 },
      { type: "text", name: "motivo", max: 300 },
      { type: "file", name: "foto_saida", maxSelect: 1, maxSize: 5 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
      { type: "text", name: "substituiu_entrada", max: 30 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_fila_empresa_status_ordem ON fila_entradas (empresa, status, ordem)",
      "CREATE INDEX idx_fila_cliente ON fila_entradas (cliente, empresa, status)",
    ],
  });
  app.save(fila);

  // ------------------------------------------------------------- fila_sinais
  const sinais = new Collection({
    type: "base",
    name: "fila_sinais",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "versao", onlyInt: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_fila_sinais_empresa ON fila_sinais (empresa)"],
  });
  app.save(sinais);

  // ------------------------------------------------------------------ regras
  // veiculos: o próprio cliente; a equipe ativa de uma empresa onde o cliente tem vínculo.
  veiculos.listRule = "cliente = @request.auth.id || (" +
    '@request.auth.id != "" && ' +
    "@collection.vinculos:eu.usuario ?= @request.auth.id && " +
    "@collection.vinculos:eu.ativo ?= true && " +
    '@collection.vinculos:eu.papel ?!= "cliente" && ' +
    "@collection.vinculos:dono.usuario ?= cliente && " +
    "@collection.vinculos:dono.empresa ?= @collection.vinculos:eu.empresa)";
  veiculos.viewRule = veiculos.listRule;
  veiculos.createRule = '@request.auth.id != "" && @request.body.cliente = @request.auth.id';
  veiculos.updateRule = "cliente = @request.auth.id && @request.body.cliente:changed = false";
  veiculos.deleteRule = null; // remover = desativar (mantém o histórico da fila)
  app.save(veiculos);

  // servicos: ativos de empresa ativa são públicos (preço e tempo aparecem antes de entrar na fila).
  servicos.listRule = "(ativo = true && empresa.ativo = true) || " + membro("eu", "empresa", EQUIPE);
  servicos.viewRule = servicos.listRule;
  servicos.createRule = membro("eu", "@request.body.empresa", ["patrao"]);
  servicos.updateRule = membro("eu", "empresa", ["patrao"]) + " && @request.body.empresa:changed = false";
  servicos.deleteRule = null; // desativar em vez de apagar
  app.save(servicos);

  // fila_entradas: equipe ativa da empresa vê tudo; cliente vê as próprias.
  fila.listRule = "cliente = @request.auth.id || " + membro("eu", "empresa", EQUIPE);
  fila.viewRule = fila.listRule;
  fila.createRule = null;
  fila.updateRule = null;
  fila.deleteRule = null;
  app.save(fila);

  // fila_sinais: público (só tem empresa + número de versão).
  sinais.listRule = "";
  sinais.viewRule = "";
  sinais.createRule = null;
  sinais.updateRule = null;
  sinais.deleteRule = null;
  app.save(sinais);
}, (app) => {
  for (const nome of ["fila_sinais", "fila_entradas", "servicos", "veiculos"]) {
    try {
      app.delete(app.findCollectionByNameOrId(nome));
    } catch (_) {}
  }
});
