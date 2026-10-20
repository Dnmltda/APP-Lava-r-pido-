/// <reference path="../pb_data/types.d.ts" />
// Planos (pacotes) e cartão fidelidade. O dono cria os planos e ativa cada pedido depois de
// receber no balcão; na fila, quem gere a fila usa a lavagem do plano ou o prêmio de fidelidade.

// POST /api/lr/planos/pedir { plano, veiculo }  — o cliente pede um plano para um carro.
routerAdd("POST", "/api/lr/planos/pedir", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ plano: "", veiculo: "" });
  e.bindBody(body);
  let plano, v;
  try {
    plano = e.app.findRecordById("planos", String(body.plano || ""));
    v = e.app.findRecordById("veiculos", String(body.veiculo || ""));
  } catch (_) {
    throw new NotFoundError("Plano ou carro não encontrado.");
  }
  const empresaId = plano.getString("empresa");
  const vc = lib.acharVinculo(e.app, e.auth.id, empresaId);
  if (!vc || !vc.getBool("ativo") || vc.getString("papel") !== "cliente") throw new ForbiddenError("Só clientes deste lava rápido pedem planos.");
  if (!plano.getBool("ativo")) throw new BadRequestError("Este plano não está mais disponível.");
  if (v.getString("cliente") !== e.auth.id || !v.getBool("ativo")) throw new BadRequestError("Escolha um carro seu.");
  const abertos = e.app.findRecordsByFilter(
    "assinaturas", "empresa = {:e} && veiculo = {:v} && (status = 'pedido' || (status = 'ativa' && fim > {:a}))", "", 5, 0,
    { e: empresaId, v: v.id, a: new Date().toISOString().replace("T", " ") },
  );
  if (abertos.some((a) => a.getString("status") === "pedido")) throw new BadRequestError("Este carro já tem um pedido de plano esperando o lava rápido.");
  const a = new Record(e.app.findCollectionByNameOrId("assinaturas"));
  a.set("empresa", empresaId);
  a.set("cliente", e.auth.id);
  a.set("veiculo", v.id);
  a.set("plano", plano.id);
  a.set("plano_nome", plano.getString("nome"));
  a.set("status", "pedido");
  a.set("lavagens_total", plano.getInt("lavagens"));
  a.set("lavagens_usadas", 0);
  e.app.save(a);
  const empresa = e.app.findRecordById("empresas", empresaId);
  const cliente = e.app.findRecordById("usuarios", e.auth.id);
  lib.avisarPatroes(e.app, empresa, {
    titulo: "Pedido de plano · " + empresa.getString("nome"),
    texto: cliente.getString("nome") + " quer o plano " + plano.getString("nome") + ". Ative quando receber no balcão.",
    url: "/" + empresa.getString("slug") + "/planos",
    tag: "plano-" + a.id,
  });
  return e.json(201, { id: a.id });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/planos/{id}/decidir { aprovar, valor, forma, motivo }  — só o dono.
// Aprovar = recebeu no balcão: o plano começa hoje e o valor entra no caixa ("Planos").
routerAdd("POST", "/api/lr/planos/{id}/decidir", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ aprovar: false, valor: 0, forma: "", motivo: "" });
  e.bindBody(body);
  let a;
  try {
    a = e.app.findRecordById("assinaturas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Pedido não encontrado.");
  }
  const empresaId = a.getString("empresa");
  if (!lib.ehPatraoAtivo(e.app, e.auth.id, empresaId)) throw new ForbiddenError("Só o dono ativa planos.");
  if (a.getString("status") !== "pedido") throw new BadRequestError("Este pedido já foi decidido.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const slug = empresa.getString("slug");
  if (body.aprovar) {
    const plano = e.app.findRecordById("planos", a.getString("plano"));
    const valor = Math.round(Number(body.valor || plano.getFloat("preco")) * 100) / 100;
    if (!(valor > 0)) throw new BadRequestError("Informe o valor recebido.");
    const forma = String(body.forma || "");
    if (["cartao", "pix", "dinheiro"].indexOf(forma) < 0) throw new BadRequestError("Escolha a forma de pagamento.");
    const agora = Date.now();
    e.app.runInTransaction((tx) => {
      a.set("status", "ativa");
      a.set("inicio", new Date(agora).toISOString().replace("T", " "));
      a.set("fim", new Date(agora + plano.getInt("validade_dias") * 86400000).toISOString().replace("T", " "));
      a.set("valor_pago", valor);
      a.set("forma_pagamento", forma);
      a.set("decidido_por", e.auth.id);
      tx.save(a);
      const l = new Record(tx.findCollectionByNameOrId("lancamentos_caixa"));
      l.set("empresa", empresaId);
      l.set("data", new Date(agora).toISOString().replace("T", " "));
      l.set("tipo", "entrada");
      l.set("categoria", "Planos");
      l.set("valor", valor);
      l.set("descricao", "Plano " + a.getString("plano_nome") + " (" + forma + ")");
      l.set("criado_por", e.auth.id);
      tx.save(l);
      lib.auditar(tx, { empresa: empresaId, usuario: e.auth.id, acao: "plano_ativado", entidade: "assinaturas", entidade_id: a.id, depois: { valor: valor, forma: forma } });
    });
    lib.notificarUsuario(e.app, a.getString("cliente"), {
      titulo: "Plano ativo ✅ · " + empresa.getString("nome"),
      texto: "Seu plano " + a.getString("plano_nome") + " está ativo. Na fila, a equipe usa as lavagens do plano.",
      url: "/" + slug + "/planos",
      tag: "plano-" + a.id,
    });
  } else {
    a.set("status", "recusada");
    a.set("motivo", String(body.motivo || "").trim().slice(0, 300));
    a.set("decidido_por", e.auth.id);
    e.app.save(a);
    lib.auditar(e.app, { empresa: empresaId, usuario: e.auth.id, acao: "plano_recusado", entidade: "assinaturas", entidade_id: a.id, motivo: a.getString("motivo") });
  }
  return e.json(200, { status: a.getString("status") });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/planos/{id}/cancelar { motivo }  — só o dono (o caixa não muda sozinho).
routerAdd("POST", "/api/lr/planos/{id}/cancelar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ motivo: "" });
  e.bindBody(body);
  let a;
  try {
    a = e.app.findRecordById("assinaturas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Plano não encontrado.");
  }
  if (!lib.ehPatraoAtivo(e.app, e.auth.id, a.getString("empresa"))) throw new ForbiddenError("Só o dono cancela planos.");
  if (a.getString("status") !== "ativa") throw new BadRequestError("Só dá para cancelar plano ativo.");
  a.set("status", "cancelada");
  a.set("motivo", String(body.motivo || "").trim().slice(0, 300));
  e.app.save(a);
  lib.auditar(e.app, { empresa: a.getString("empresa"), usuario: e.auth.id, acao: "plano_cancelado", entidade: "assinaturas", entidade_id: a.id, motivo: a.getString("motivo") });
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/beneficio/{entrada} { tipo: "plano" | "premio", usar }
// Usar (ou desfazer) uma lavagem do plano ou o prêmio do cartão fidelidade nesta entrada da fila.
routerAdd("POST", "/api/lr/beneficio/{id}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ tipo: "", usar: true });
  e.bindBody(body);
  const beneficio = String(body.tipo || "");
  if (beneficio !== "plano" && beneficio !== "premio") throw new BadRequestError("Benefício inválido.");
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Entrada da fila não encontrada.");
  }
  const empresaId = entrada.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!vinculo || !lib.podeGerirFila(vinculo)) throw new ForbiddenError("Só quem gere a fila usa o plano ou o prêmio.");
  if (lib.STATUS_ATIVOS.indexOf(entrada.getString("status")) < 0) throw new BadRequestError("Esta entrada não está mais na fila.");
  const clienteId = entrada.getString("cliente");
  if (!clienteId) throw new BadRequestError("Cliente sem cadastro no app.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const servico = e.app.findRecordById("servicos", entrada.getString("servico"));

  e.app.runInTransaction((tx) => {
    const desfazer = () => {
      const idA = entrada.getString("assinatura");
      if (idA) {
        const a = tx.findRecordById("assinaturas", idA);
        a.set("lavagens_usadas", Math.max(0, a.getInt("lavagens_usadas") - 1));
        tx.save(a);
      }
      // volta o preço do tipo do carro
      lib.aplicarTipo(entrada, servico, empresa, entrada.getString("tipo_veiculo"));
      entrada.set("assinatura", "");
      entrada.set("premio_fidelidade", false);
      entrada.set("preco_tabela", 0);
    };
    if (!body.usar) {
      desfazer();
    } else {
      if (entrada.getString("assinatura") || entrada.getBool("premio_fidelidade")) throw new BadRequestError("Esta lavagem já está no plano ou no prêmio.");
      const preco = entrada.getFloat("preco_servico");
      if (beneficio === "plano") {
        const a = lib.assinaturaDoCarro(tx, empresaId, clienteId, entrada.getString("veiculo"));
        if (!a) throw new BadRequestError("Este carro não tem plano ativo com lavagens sobrando.");
        if (!lib.planoCobreServico(tx, a, servico.id)) throw new BadRequestError("O plano não cobre o serviço " + servico.getString("nome") + ".");
        a.set("lavagens_usadas", a.getInt("lavagens_usadas") + 1);
        tx.save(a);
        entrada.set("assinatura", a.id);
      } else {
        const f = lib.fidelidadeDoCliente(tx, empresa, clienteId);
        if (!f || f.disponiveis < 1) throw new BadRequestError("O cliente ainda não tem prêmio de fidelidade disponível.");
        entrada.set("premio_fidelidade", true);
      }
      entrada.set("preco_tabela", preco);
      entrada.set("preco_servico", 0);
    }
    tx.save(entrada);
    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: (body.usar ? "usar_" : "desfazer_") + beneficio, entidade: "fila_entradas", entidade_id: entrada.id,
      depois: { preco: entrada.getFloat("preco_servico") },
    });
  });
  return e.json(200, { preco_servico: entrada.getFloat("preco_servico"), assinatura: entrada.getString("assinatura"), premio_fidelidade: entrada.getBool("premio_fidelidade") });
}, $apis.requireAuth("usuarios"));

// Entrada cancelada/recusada devolve a lavagem do plano.
onRecordUpdate((e) => {
  const novo = e.record.getString("status");
  const antes = e.record.original().getString("status");
  const idA = e.record.getString("assinatura");
  if (idA && antes !== novo && (novo === "cancelado" || novo === "recusado")) {
    try {
      const a = e.app.findRecordById("assinaturas", idA);
      a.set("lavagens_usadas", Math.max(0, a.getInt("lavagens_usadas") - 1));
      e.app.save(a);
    } catch (_) {}
  }
  e.next();
}, "fila_entradas");

// GET /api/lr/beneficios/{empresa}  — para a fila da equipe: plano e prêmio de cada cliente na fila.
routerAdd("GET", "/api/lr/beneficios/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  if (!lib.vinculoEquipe(e.app, e.auth.id, empresaId)) throw new ForbiddenError("Só a equipe.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const ativos = "(" + lib.STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")";
  const entradas = e.app.findRecordsByFilter("fila_entradas", "empresa = {:e} && cliente != '' && " + ativos, "", 0, 0, { e: empresaId });
  const porEntrada = {};
  const fidel = {};
  for (const en of entradas) {
    const c = en.getString("cliente");
    if (!(c in fidel)) fidel[c] = lib.fidelidadeDoCliente(e.app, empresa, c);
    const a = en.getString("veiculo") ? lib.assinaturaDoCarro(e.app, empresaId, c, en.getString("veiculo")) : null;
    porEntrada[en.id] = {
      plano: a ? { nome: a.getString("plano_nome"), restantes: a.getInt("lavagens_total") - a.getInt("lavagens_usadas"), fim: a.getString("fim"), cobre: lib.planoCobreServico(e.app, a, en.getString("servico")) } : null,
      fidelidade: fidel[c],
    };
  }
  return e.json(200, porEntrada);
}, $apis.requireAuth("usuarios"));

// GET /api/lr/meus-planos/{slug}  — o cliente: planos dele e o cartão fidelidade.
routerAdd("GET", "/api/lr/meus-planos/{slug}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, e.request.pathValue("slug"));
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");
  const lista = e.app.findRecordsByFilter("assinaturas", "empresa = {:e} && cliente = {:c}", "-created", 30, 0, { e: empresa.id, c: e.auth.id });
  const agora = Date.now();
  const planos = lista.map((a) => {
    let carro = "";
    try {
      const v = e.app.findRecordById("veiculos", a.getString("veiculo"));
      carro = [v.getString("modelo"), v.getString("placa") || "…" + v.getString("final_placa")].filter(Boolean).join(" · ");
    } catch (_) {}
    const fim = a.getString("fim") ? Date.parse(a.getString("fim").replace(" ", "T")) : 0;
    let status = a.getString("status");
    if (status === "ativa" && fim && fim < agora) status = "vencida";
    if (status === "ativa" && a.getInt("lavagens_usadas") >= a.getInt("lavagens_total")) status = "usada";
    return {
      id: a.id, plano: a.getString("plano_nome"), carro: carro, status: status, motivo: a.getString("motivo"),
      restantes: a.getInt("lavagens_total") - a.getInt("lavagens_usadas"), total: a.getInt("lavagens_total"), fim: a.getString("fim"),
    };
  });
  return e.json(200, { planos: planos, fidelidade: lib.fidelidadeDoCliente(e.app, empresa, e.auth.id) });
}, $apis.requireAuth("usuarios"));
