/// <reference path="../pb_data/types.d.ts" />
// Trazer o cliente de volta: reativar quem sumiu, agendamento pedido pelo cliente e orçamento.
// Regra do Diego: nada vira lugar na fila nem valor combinado sem passar pela equipe.

// ------------------------------------------------------------------ reativar
// GET /api/lr/reativar/{empresa}?dias=30  — dono e gerente: clientes que não voltam há X dias.
routerAdd("GET", "/api/lr/reativar/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  const v = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!v || (v.getString("papel") !== "patrao" && v.getString("papel") !== "gerente")) throw new ForbiddenError("Só o dono e o gerente veem quem sumiu.");
  const dias = Math.min(365, Math.max(7, parseInt(e.request.url.query().get("dias") || "30", 10) || 30));
  const corte = Date.now() - dias * 86400000;
  const clientes = e.app.findRecordsByFilter("vinculos", "empresa = {:e} && papel = 'cliente' && ativo = true", "", 0, 0, { e: empresaId });
  const ativos = "(" + lib.STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")";
  const lista = [];
  for (const vc of clientes) {
    const uid = vc.getString("usuario");
    const fins = e.app.findRecordsByFilter("fila_entradas", "empresa = {:e} && cliente = {:c} && status = 'finalizado'", "-finalizado_em", 0, 0, { e: empresaId, c: uid });
    const ultima = fins.length ? Date.parse(fins[0].getString("finalizado_em").replace(" ", "T")) : 0;
    const desde = Date.parse(vc.getString("created").replace(" ", "T"));
    if (ultima ? ultima > corte : desde > corte) continue; // voltou há pouco, ou é cadastro novo
    if (e.app.findRecordsByFilter("fila_entradas", "empresa = {:e} && cliente = {:c} && " + ativos, "", 1, 0, { e: empresaId, c: uid }).length) continue;
    let u;
    try {
      u = e.app.findRecordById("usuarios", uid);
    } catch (_) {
      continue;
    }
    lista.push({
      usuario: uid, nome: u.getString("nome"), celular: u.getString("celular"), aceita_promocoes: u.getBool("aceite_marketing"),
      visitas: fins.length, ultima_visita: ultima ? new Date(ultima).toISOString() : "", cliente_desde: new Date(desde).toISOString(),
      contatado_em: vc.getString("reativacao_em"),
    });
  }
  lista.sort((a, b) => (a.ultima_visita || a.cliente_desde).localeCompare(b.ultima_visita || b.cliente_desde));
  return e.json(200, { dias: dias, clientes: lista });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/reativar/{empresa}/{usuario}  — marca que a mensagem foi mandada agora.
routerAdd("POST", "/api/lr/reativar/{empresa}/{usuario}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  const v = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!v || (v.getString("papel") !== "patrao" && v.getString("papel") !== "gerente")) throw new ForbiddenError("Só o dono e o gerente.");
  const vc = lib.acharVinculo(e.app, e.request.pathValue("usuario"), empresaId);
  if (!vc || vc.getString("papel") !== "cliente") throw new NotFoundError("Cliente não encontrado.");
  vc.set("reativacao_em", lib.agoraISO());
  e.app.unsafeWithoutHooks().save(vc);
  lib.auditar(e.app, { empresa: empresaId, usuario: e.auth.id, acao: "reativar_cliente", entidade: "vinculos", entidade_id: vc.id });
  return e.json(200, { contatado_em: vc.getString("reativacao_em") });
}, $apis.requireAuth("usuarios"));

// ---------------------------------------------------------------- agendamento
// POST /api/lr/agendar { slug, servico, veiculos[], horario, observacao, orcamento }
// O cliente PEDE um horário. Só vira lugar na fila quando a equipe responde.
routerAdd("POST", "/api/lr/agendar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ slug: "", servico: "", veiculos: [], horario: "", observacao: "", orcamento: "" });
  e.bindBody(body);
  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, body.slug);
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");
  const vc = lib.acharVinculo(e.app, e.auth.id, empresa.id);
  if (!vc || !vc.getBool("ativo") || vc.getString("papel") !== "cliente") throw new ForbiddenError("Só clientes deste lava rápido agendam pelo app.");
  let servico;
  try {
    servico = e.app.findRecordById("servicos", String(body.servico || ""));
  } catch (_) {}
  if (!servico || servico.getString("empresa") !== empresa.id || !servico.getBool("ativo")) throw new BadRequestError("Escolha um serviço.");
  let ids = [];
  try {
    ids = Array.from(body.veiculos || []).map(String);
  } catch (_) {}
  ids = ids.filter((x, i) => x && ids.indexOf(x) === i);
  if (!ids.length) throw new BadRequestError("Escolha o veículo.");
  if (ids.length > lib.MAX_CARROS_POR_PEDIDO) throw new BadRequestError("Marque até " + lib.MAX_CARROS_POR_PEDIDO + " carros de uma vez.");
  for (const id of ids) {
    let v;
    try {
      v = e.app.findRecordById("veiculos", id);
    } catch (_) {}
    if (!v || v.getString("cliente") !== e.auth.id || !v.getBool("ativo")) throw new BadRequestError("Escolha um carro seu.");
  }
  let orc = null;
  if (body.orcamento) {
    try {
      orc = e.app.findRecordById("orcamentos", String(body.orcamento));
    } catch (_) {}
    if (!orc || orc.getString("cliente") !== e.auth.id || orc.getString("status") !== "aceito") throw new BadRequestError("Orçamento não encontrado ou ainda não aceito.");
    if (ids.length !== 1 || ids[0] !== orc.getString("veiculo")) throw new BadRequestError("O orçamento vale só para o carro dele.");
  } else if (servico.getBool("sob_orcamento")) {
    throw new BadRequestError("Este serviço é sob orçamento: peça o orçamento primeiro.");
  }
  const horario = Date.parse(String(body.horario || ""));
  const agora = Date.now();
  if (isNaN(horario)) throw new BadRequestError("Escolha o dia e o horário.");
  if (horario < agora + 10 * 60000) throw new BadRequestError("Escolha um horário daqui a pelo menos 10 minutos.");
  if (horario > agora + 30 * 86400000) throw new BadRequestError("Agendamento só até 30 dias para a frente.");
  const abertos = e.app.findRecordsByFilter("agendamentos", "empresa = {:e} && cliente = {:c} && status = 'pedido'", "", 5, 0, { e: empresa.id, c: e.auth.id });
  if (abertos.length >= 3) throw new BadRequestError("Você já tem pedidos de horário esperando resposta.");
  const a = new Record(e.app.findCollectionByNameOrId("agendamentos"));
  a.set("empresa", empresa.id);
  a.set("cliente", e.auth.id);
  a.set("veiculos", ids);
  a.set("servico", servico.id);
  if (orc) a.set("orcamento", orc.id);
  a.set("horario_pedido", new Date(horario).toISOString().replace("T", " "));
  a.set("observacao", String(body.observacao || "").trim().slice(0, 300));
  a.set("status", "pedido");
  e.app.save(a);
  const u = e.app.findRecordById("usuarios", e.auth.id);
  lib.avisarEquipe(e.app, empresa.id, ["patrao", "gerente", "responsavel"], {
    titulo: "Pedido de horário · " + empresa.getString("nome"),
    texto: u.getString("nome") + " quer " + servico.getString("nome") + " em " + lib.FMT_DATA_HORA_SP(horario) + ". Confirme na Fila.",
    url: "/" + empresa.getString("slug") + "/fila",
    tag: "agenda-" + a.id,
  });
  return e.json(201, { id: a.id });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/agendamentos/{id}/responder { como: no_horario | outro_horario | na_fila | recusar, horario, resposta }
// Quem gere a fila responde. Confirmado = os carros entram na fila (reserva no horário ou fim da fila).
routerAdd("POST", "/api/lr/agendamentos/{id}/responder", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ como: "", horario: "", resposta: "" });
  e.bindBody(body);
  let a;
  try {
    a = e.app.findRecordById("agendamentos", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Pedido não encontrado.");
  }
  const empresaId = a.getString("empresa");
  const vinculoEq = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!lib.podeGerirFila(vinculoEq)) throw new ForbiddenError("Só quem gere a fila responde os pedidos de horário.");
  if (a.getString("status") !== "pedido") throw new BadRequestError("Este pedido já foi respondido.");
  const como = String(body.como || "");
  const resposta = String(body.resposta || "").trim().slice(0, 300);
  const empresa = e.app.findRecordById("empresas", empresaId);
  const slug = empresa.getString("slug");
  let horario = 0;
  if (como === "recusar") {
    a.set("status", "recusado");
    a.set("resposta", resposta);
    a.set("respondido_por", e.auth.id);
    e.app.save(a);
  } else {
    if (["no_horario", "outro_horario", "na_fila"].indexOf(como) < 0) throw new BadRequestError("Escolha como confirmar.");
    if (como === "no_horario") horario = Date.parse(a.getString("horario_pedido").replace(" ", "T"));
    if (como === "outro_horario") {
      horario = Date.parse(String(body.horario || ""));
      if (isNaN(horario) || horario < Date.now() - 5 * 60000 || horario > Date.now() + 30 * 86400000) throw new BadRequestError("Escolha um horário válido (até 30 dias).");
    }
    if (como === "no_horario" && horario < Date.now() - 5 * 60000) throw new BadRequestError("O horário pedido já passou: sugira outro ou coloque na fila.");
    const servico = e.app.findRecordById("servicos", a.getString("servico"));
    const vcCliente = lib.acharVinculo(e.app, a.getString("cliente"), empresaId);
    let orc = null;
    if (a.getString("orcamento")) orc = e.app.findRecordById("orcamentos", a.getString("orcamento"));
    e.app.runInTransaction((tx) => {
      const ids = [];
      for (const vid of a.get("veiculos") || []) {
        const veiculo = tx.findRecordById("veiculos", vid);
        const en = lib.criarEntradaConfirmada(tx, {
          empresa: empresa, servico: servico, clienteId: a.getString("cliente"), vinculo: vcCliente, veiculo: veiculo,
          horario: horario, autor: e.auth.id, observacao: a.getString("observacao"),
          valor: orc ? orc.getFloat("valor") : undefined, duracao: orc ? orc.getInt("duracao_min") : 0,
        });
        ids.push(en.id);
      }
      a.set("status", "confirmado");
      a.set("como", como);
      a.set("resposta", resposta);
      a.set("entradas", ids);
      a.set("respondido_por", e.auth.id);
      if (horario) a.set("horario_confirmado", new Date(horario).toISOString().replace("T", " "));
      tx.save(a);
      lib.auditar(tx, { empresa: empresaId, usuario: e.auth.id, acao: "agendamento_" + como, entidade: "agendamentos", entidade_id: a.id, depois: { entradas: ids } });
    });
  }
  const textos = {
    recusar: "Não deu para o horário pedido." + (resposta ? " " + resposta : ""),
    no_horario: "Confirmado para " + lib.FMT_DATA_HORA_SP(horario) + ".",
    outro_horario: "O lava rápido sugeriu " + lib.FMT_DATA_HORA_SP(horario) + " (já está reservado para você).",
    na_fila: "Você entrou na fila agora, na sequência.",
  };
  lib.notificarUsuario(e.app, a.getString("cliente"), {
    titulo: (como === "recusar" ? "Horário não confirmado" : "Horário confirmado ✅") + " · " + empresa.getString("nome"),
    texto: textos[como] + (resposta && como !== "recusar" ? " " + resposta : ""),
    url: "/" + slug + "/agendar",
    tag: "agenda-" + a.id,
  });
  return e.json(200, { status: a.getString("status"), entradas: a.get("entradas") || [] });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/agendamentos/{id}/cancelar  — o cliente desiste antes da resposta.
routerAdd("POST", "/api/lr/agendamentos/{id}/cancelar", (e) => {
  let a;
  try {
    a = e.app.findRecordById("agendamentos", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Pedido não encontrado.");
  }
  if (a.getString("cliente") !== e.auth.id) throw new NotFoundError("Pedido não encontrado.");
  if (a.getString("status") !== "pedido") throw new BadRequestError("Já respondido: para desistir, cancele a vez na fila.");
  a.set("status", "cancelado");
  e.app.save(a);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

// ------------------------------------------------------------------- orçamento
// O cliente cria pela coleção (pode mandar fotos). O servidor confere e avisa dono e gerente.
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  if (e.hasSuperuserAuth()) return e.next();
  const empresaId = e.record.getString("empresa");
  const vc = lib.acharVinculo(e.app, e.auth.id, empresaId);
  if (!vc || !vc.getBool("ativo") || vc.getString("papel") !== "cliente") throw new ForbiddenError("Só clientes deste lava rápido pedem orçamento.");
  let v;
  try {
    v = e.app.findRecordById("veiculos", e.record.getString("veiculo"));
  } catch (_) {}
  if (!v || v.getString("cliente") !== e.auth.id || !v.getBool("ativo")) throw new BadRequestError("Escolha um carro seu.");
  if (e.record.getString("servico")) {
    let s;
    try {
      s = e.app.findRecordById("servicos", e.record.getString("servico"));
    } catch (_) {}
    if (!s || s.getString("empresa") !== empresaId) throw new BadRequestError("Serviço não encontrado.");
  }
  const abertos = e.app.findRecordsByFilter("orcamentos", "empresa = {:e} && cliente = {:c} && (status = 'pedido' || status = 'respondido')", "", 10, 0, { e: empresaId, c: e.auth.id });
  if (abertos.length >= 5) throw new BadRequestError("Você já tem orçamentos em aberto.");
  e.record.set("status", "pedido");
  e.record.set("valor", 0);
  e.record.set("duracao_min", 0);
  e.record.set("resposta", "");
  e.record.set("validade", "");
  e.record.set("respondido_por", "");
  e.record.set("descricao", e.record.getString("descricao").trim());
  e.next();
  const empresa = e.app.findRecordById("empresas", empresaId);
  const u = e.app.findRecordById("usuarios", e.auth.id);
  lib.avisarEquipe(e.app, empresaId, ["patrao", "gerente"], {
    titulo: "Pedido de orçamento · " + empresa.getString("nome"),
    texto: u.getString("nome") + ": " + e.record.getString("descricao").slice(0, 80),
    url: "/" + empresa.getString("slug") + "/orcamentos",
    tag: "orc-" + e.record.id,
  });
}, "orcamentos");

// POST /api/lr/orcamentos/{id}/responder { valor, duracao_min, resposta, validade_dias }  — dono ou gerente.
routerAdd("POST", "/api/lr/orcamentos/{id}/responder", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ valor: 0, duracao_min: 0, resposta: "", validade_dias: 7 });
  e.bindBody(body);
  let o;
  try {
    o = e.app.findRecordById("orcamentos", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Orçamento não encontrado.");
  }
  const empresaId = o.getString("empresa");
  const v = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!v || (v.getString("papel") !== "patrao" && v.getString("papel") !== "gerente")) throw new ForbiddenError("Só o dono e o gerente respondem orçamentos.");
  if (["pedido", "respondido"].indexOf(o.getString("status")) < 0) throw new BadRequestError("Este orçamento já foi decidido pelo cliente.");
  const valor = Math.round(Number(body.valor) * 100) / 100;
  if (!(valor > 0)) throw new BadRequestError("Informe o valor.");
  const dur = parseInt(body.duracao_min, 10) || 0;
  if (dur < 0 || dur > 1440) throw new BadRequestError("Tempo entre 0 e 1440 minutos.");
  const validade = Math.min(60, Math.max(1, parseInt(body.validade_dias, 10) || 7));
  o.set("valor", valor);
  o.set("duracao_min", dur);
  o.set("resposta", String(body.resposta || "").trim().slice(0, 600));
  o.set("validade", new Date(Date.now() + validade * 86400000).toISOString().replace("T", " "));
  o.set("status", "respondido");
  o.set("respondido_por", e.auth.id);
  e.app.save(o);
  lib.auditar(e.app, { empresa: empresaId, usuario: e.auth.id, acao: "orcamento_respondido", entidade: "orcamentos", entidade_id: o.id, depois: { valor: valor } });
  const empresa = e.app.findRecordById("empresas", empresaId);
  lib.notificarUsuario(e.app, o.getString("cliente"), {
    titulo: "Seu orçamento chegou · " + empresa.getString("nome"),
    texto: "Veja o valor e aceite ou recuse no app.",
    url: "/" + empresa.getString("slug") + "/orcamentos",
    tag: "orc-" + o.id,
  });
  return e.json(200, { status: "respondido" });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/orcamentos/{id}/decidir { aceitar }  — o cliente, dentro da validade.
routerAdd("POST", "/api/lr/orcamentos/{id}/decidir", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ aceitar: false });
  e.bindBody(body);
  let o;
  try {
    o = e.app.findRecordById("orcamentos", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Orçamento não encontrado.");
  }
  if (o.getString("cliente") !== e.auth.id) throw new NotFoundError("Orçamento não encontrado.");
  if (o.getString("status") !== "respondido") throw new BadRequestError("Este orçamento ainda não tem resposta ou já foi decidido.");
  if (body.aceitar && Date.parse(o.getString("validade").replace(" ", "T")) < Date.now()) throw new BadRequestError("Este orçamento venceu. Peça um novo.");
  o.set("status", body.aceitar ? "aceito" : "recusado");
  e.app.save(o);
  const empresa = e.app.findRecordById("empresas", o.getString("empresa"));
  const u = e.app.findRecordById("usuarios", e.auth.id);
  lib.avisarEquipe(e.app, empresa.id, ["patrao", "gerente"], {
    titulo: "Orçamento " + (body.aceitar ? "aceito ✅" : "recusado") + " · " + empresa.getString("nome"),
    texto: u.getString("nome") + (body.aceitar ? " aceitou. Ele vai pedir o horário pelo app." : " recusou o orçamento."),
    url: "/" + empresa.getString("slug") + "/orcamentos",
    tag: "orc-" + o.id,
  });
  return e.json(200, { status: o.getString("status") });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/orcamentos/{id}/cancelar  — o cliente desiste enquanto não aceitou.
routerAdd("POST", "/api/lr/orcamentos/{id}/cancelar", (e) => {
  let o;
  try {
    o = e.app.findRecordById("orcamentos", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Orçamento não encontrado.");
  }
  if (o.getString("cliente") !== e.auth.id) throw new NotFoundError("Orçamento não encontrado.");
  if (["pedido", "respondido"].indexOf(o.getString("status")) < 0) throw new BadRequestError("Este orçamento já foi decidido.");
  o.set("status", "cancelado");
  e.app.save(o);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));
