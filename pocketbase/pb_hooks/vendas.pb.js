/// <reference path="../pb_data/types.d.ts" />
// ETAPA 4 — Catálogo, carrinho/OS (produtos a separar) e vendas por funcionário.

// --------------------------------------------------------------- produtos
onRecordCreate((e) => {
  const r = e.record;
  if (!r.getString("comissao_tipo")) r.set("comissao_tipo", "nenhuma");
  e.next();
}, "produtos");

// Ajustes do patrão em preço, estoque e comissão vão para a auditoria.
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const campos = ["nome", "preco", "estoque", "estoque_minimo", "comissao_tipo", "comissao_valor", "ativo"];
  const original = e.record.original();
  const antes = {};
  for (const c of campos) antes[c] = original.get(c);
  e.next();
  const depois = {};
  let mudou = false;
  for (const c of campos) {
    depois[c] = e.record.get(c);
    if (String(depois[c]) !== String(antes[c])) mudou = true;
  }
  if (mudou) {
    lib.auditar(e.app, {
      empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "produto_editar",
      entidade: "produtos", entidade_id: e.record.id, antes: antes, depois: depois,
    });
  }
}, "produtos");

// ---------------------------------------------------------------- catálogo
// GET /api/lr/catalogo/{slug}: o que o cliente vê (sem estoque nem comissão).
routerAdd("GET", "/api/lr/catalogo/{slug}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, e.request.pathValue("slug"));
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");
  const produtos = e.app.findRecordsByFilter("produtos", "empresa = {:e} && ativo = true", "nome", 0, 0, { e: empresa.id });
  return e.json(200, Array.from(produtos).map((p) => ({
    id: p.id,
    collectionId: p.collection().id,
    nome: p.getString("nome"),
    descricao: p.getString("descricao"),
    preco: p.getFloat("preco"),
    foto: p.getString("foto"),
    disponivel: p.getInt("estoque") > 0,
  })));
});

// ------------------------------------- cliente reserva produtos na fila
// O cliente pode reservar produtos a qualquer momento enquanto o carro está na fila
// (ou lavando), sem precisar escolher tudo antes de entrar. Sem pagamento: paga no local.
// POST /api/lr/fila/{id}/produtos { itens: [{produto, quantidade}] }  (só o cliente do carro)
routerAdd("POST", "/api/lr/fila/{id}/produtos", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ itens: [] });
  e.bindBody(body);
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {}
  if (!entrada || entrada.getString("cliente") !== e.auth.id) throw new NotFoundError("Você não está nesta fila.");
  if (["pendente", "confirmado", "avisado", "no_local", "lavando"].indexOf(entrada.getString("status")) < 0) {
    throw new BadRequestError("Seu carro já saiu da fila. Peça os produtos no balcão.");
  }
  const empresaId = entrada.getString("empresa");
  const novos = lib.validarItens(e.app, empresaId, body.itens, 20);
  if (!novos.length) throw new BadRequestError("Escolha pelo menos um produto.");
  e.app.runInTransaction((tx) => {
    const atuais = Array.from(tx.findRecordsByFilter("itens_pedido", "entrada = {:e}", "", 0, 0, { e: entrada.id }));
    let linhas = atuais.length;
    const col = tx.findCollectionByNameOrId("itens_pedido");
    for (const it of novos) {
      // Mesmo produto ainda não separado: só soma a quantidade.
      const igual = atuais.find((r) => r.getString("produto") === it.produto.id && r.getString("status") === "pendente");
      if (igual) {
        const qtd = igual.getInt("quantidade") + it.quantidade;
        if (qtd > 20) throw new BadRequestError("Máximo de 20 unidades de " + it.produto.getString("nome") + ".");
        igual.set("quantidade", qtd);
        tx.save(igual);
        continue;
      }
      if (++linhas > 30) throw new BadRequestError("Produtos demais neste pedido.");
      const ip = new Record(col);
      ip.set("empresa", empresaId);
      ip.set("entrada", entrada.id);
      ip.set("produto", it.produto.id);
      ip.set("produto_nome", it.produto.getString("nome"));
      ip.set("quantidade", it.quantidade);
      ip.set("preco_unitario", it.produto.getFloat("preco"));
      ip.set("status", "pendente");
      tx.save(ip);
    }
  });
  lib.sinalizarFila(e.app, empresaId);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/itens/{id}/remover  — o cliente tira um produto que a equipe ainda não separou.
routerAdd("POST", "/api/lr/itens/{id}/remover", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  let item, entrada;
  try {
    item = e.app.findRecordById("itens_pedido", e.request.pathValue("id"));
    entrada = e.app.findRecordById("fila_entradas", item.getString("entrada"));
  } catch (_) {}
  if (!item || !entrada || entrada.getString("cliente") !== e.auth.id) throw new NotFoundError("Item não encontrado.");
  if (["pendente", "confirmado", "avisado", "no_local", "lavando"].indexOf(entrada.getString("status")) < 0) {
    throw new BadRequestError("Seu carro já saiu da fila.");
  }
  if (item.getString("status") !== "pendente") throw new BadRequestError("A equipe já separou este produto. Fale no balcão.");
  e.app.delete(item);
  lib.sinalizarFila(e.app, entrada.getString("empresa"));
  return e.noContent(204);
}, $apis.requireAuth("usuarios"));

// --------------------------------------------------- OS: produtos a separar
// POST /api/lr/itens/{id}/status { status: separado | em_falta | pendente }
routerAdd("POST", "/api/lr/itens/{id}/status", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ status: "" });
  e.bindBody(body);
  let item;
  try {
    item = e.app.findRecordById("itens_pedido", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Item não encontrado.");
  }
  if (!lib.vinculoEquipe(e.app, e.auth.id, item.getString("empresa"))) throw new NotFoundError("Item não encontrado.");
  const status = String(body.status || "");
  if (["pendente", "separado", "em_falta"].indexOf(status) < 0) throw new BadRequestError("Status inválido.");
  item.set("status", status);
  item.set("atualizado_por", e.auth.id);
  e.app.save(item);
  lib.sinalizarFila(e.app, item.getString("empresa"));
  return e.json(200, { id: item.id, status: status });
}, $apis.requireAuth("usuarios"));

// ------------------------------------------------------------------ vendas
// POST /api/lr/vendas { empresa, entrada?, itens: [{produto, quantidade}], forma_pagamento?, fechar? }
// Qualquer pessoa ativa da equipe. A venda fica presa ao login de quem registrou.
routerAdd("POST", "/api/lr/vendas", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ empresa: "", entrada: "", itens: [], forma_pagamento: "", fechar: false });
  e.bindBody(body);
  const empresaId = String(body.empresa || "");
  if (!lib.vinculoEquipe(e.app, e.auth.id, empresaId)) throw new ForbiddenError("Só a equipe registra vendas.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const forma = String(body.forma_pagamento || "");
  if (forma && lib.FORMAS_PAGAMENTO.indexOf(forma) < 0) throw new BadRequestError("Forma de pagamento inválida.");
  const entradaId = String(body.entrada || "");
  if (entradaId) {
    let ent;
    try {
      ent = e.app.findRecordById("fila_entradas", entradaId);
    } catch (_) {}
    if (!ent || ent.getString("empresa") !== empresaId) throw new BadRequestError("Carro da fila não encontrado.");
  }
  const itens = lib.validarItens(e.app, empresaId, body.itens, 999);
  if (!itens.length) throw new BadRequestError("Adicione pelo menos um produto.");

  let venda = null;
  e.app.runInTransaction((tx) => {
    venda = new Record(tx.findCollectionByNameOrId("vendas"));
    venda.set("empresa", empresaId);
    venda.set("funcionario", e.auth.id);
    if (entradaId) venda.set("entrada", entradaId);
    venda.set("forma_pagamento", forma);
    venda.set("status", "aberta");
    tx.save(venda);
    const tot = lib.gravarItensVenda(tx, venda, itens, empresa.getBool("comissao_ativa"));
    venda.set("total", tot.total);
    venda.set("comissao_total", tot.comissao);
    tx.save(venda);
    if (body.fechar) lib.fecharVenda(tx, venda, empresa, e.auth.id);
  });
  return e.json(201, { id: venda.id, status: venda.getString("status"), total: venda.getFloat("total") });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/vendas/{id}/{acao}
//   editar    { itens, forma_pagamento, fechar? }  — quem registrou, só enquanto aberta
//   fechar    { forma_pagamento? }                 — quem registrou, só enquanto aberta
//   descartar {}                                   — quem registrou, só enquanto aberta
//   corrigir  { itens, forma_pagamento, motivo }   — só o patrão, venda fechada/corrigida
routerAdd("POST", "/api/lr/vendas/{id}/{acao}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const acao = e.request.pathValue("acao");
  if (["editar", "fechar", "descartar", "corrigir"].indexOf(acao) < 0) throw new NotFoundError("Ação desconhecida.");
  const body = new DynamicModel({ itens: [], forma_pagamento: "", fechar: false, motivo: "" });
  e.bindBody(body);

  let venda;
  try {
    venda = e.app.findRecordById("vendas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Venda não encontrada.");
  }
  const empresaId = venda.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  const dono = venda.getString("funcionario") === e.auth.id;
  const patrao = !!vinculo && vinculo.getString("papel") === "patrao";
  if (!vinculo || (!dono && !patrao && vinculo.getString("papel") !== "gerente")) throw new NotFoundError("Venda não encontrada.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const status = venda.getString("status");
  const forma = String(body.forma_pagamento || "");
  if (forma && lib.FORMAS_PAGAMENTO.indexOf(forma) < 0) throw new BadRequestError("Forma de pagamento inválida.");

  if (acao === "corrigir") {
    if (!patrao) throw new ForbiddenError("Só o patrão corrige vendas.");
    if (status !== "fechada" && status !== "corrigida") throw new BadRequestError("Só vendas fechadas são corrigidas.");
    const motivo = String(body.motivo || "").trim().slice(0, 500);
    if (motivo.length < 3) throw new BadRequestError("Informe o motivo da correção.");
    const itens = lib.validarItens(e.app, empresaId, body.itens, 999);
    if (!itens.length) throw new BadRequestError("A venda precisa de pelo menos um produto.");
    e.app.runInTransaction((tx) => {
      const antes = lib.resumoVenda(tx, venda);
      lib.moverEstoqueDaVenda(tx, venda.id, +1);
      const tot = lib.gravarItensVenda(tx, venda, itens, empresa.getBool("comissao_ativa"));
      lib.moverEstoqueDaVenda(tx, venda.id, -1);
      venda.set("total", tot.total);
      venda.set("comissao_total", tot.comissao);
      if (forma) venda.set("forma_pagamento", forma);
      venda.set("status", "corrigida");
      venda.set("corrigida_em", lib.agoraISO());
      venda.set("corrigida_por", e.auth.id);
      venda.set("motivo_correcao", motivo);
      tx.save(venda);
      lib.auditar(tx, {
        empresa: empresaId, usuario: e.auth.id, acao: "venda_corrigir",
        entidade: "vendas", entidade_id: venda.id, antes: antes, depois: lib.resumoVenda(tx, venda), motivo: motivo,
      });
    });
    return e.json(200, { id: venda.id, status: "corrigida", total: venda.getFloat("total") });
  }

  // editar / fechar / descartar: só quem registrou, e só enquanto aberta.
  if (!dono) throw new ForbiddenError("Só quem registrou a venda pode mexer nela.");
  if (status !== "aberta") throw new ForbiddenError("Venda fechada não pode ser alterada. Fale com o patrão.");

  e.app.runInTransaction((tx) => {
    if (acao === "descartar") {
      venda.set("status", "descartada");
      tx.save(venda);
      return;
    }
    if (acao === "editar") {
      const itens = lib.validarItens(tx, empresaId, body.itens, 999);
      if (!itens.length) throw new BadRequestError("Adicione pelo menos um produto.");
      const tot = lib.gravarItensVenda(tx, venda, itens, empresa.getBool("comissao_ativa"));
      venda.set("total", tot.total);
      venda.set("comissao_total", tot.comissao);
    }
    if (forma) venda.set("forma_pagamento", forma);
    tx.save(venda);
    if (acao === "fechar" || body.fechar) lib.fecharVenda(tx, venda, empresa, e.auth.id);
  });
  return e.json(200, { id: venda.id, status: venda.getString("status"), total: venda.getFloat("total") });
}, $apis.requireAuth("usuarios"));
