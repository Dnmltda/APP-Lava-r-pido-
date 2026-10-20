/// <reference path="../pb_data/types.d.ts" />
// ETAPA 2 — Fila: entrar pelo app, cliente de balcão, ações da equipe
// (confirmar, recusar, avisar, chegou, iniciar, pronto, baixa, cancelar),
// visão pública e sinal de tempo real.

// ---------------------------------------------------------------- veículos
// Placa em maiúsculas; final_placa sai da placa quando ela é informada.
onRecordCreate((e) => {
  require(`${__hooks}/lib.js`).prepararVeiculo(e.record);
  e.record.set("ativo", true);
  e.next();
}, "veiculos");

onRecordUpdate((e) => {
  require(`${__hooks}/lib.js`).prepararVeiculo(e.record);
  e.next();
}, "veiculos");

// ---------------------------------------------------------- tempo real
onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/lib.js`).sinalizarFila(e.app, e.record.getString("empresa"));
  e.next();
}, "fila_entradas");

onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/lib.js`).sinalizarFila(e.app, e.record.getString("empresa"));
  e.next();
}, "fila_entradas");

// Mudou a capacidade da empresa → previsões mudam.
onRecordAfterUpdateSuccess((e) => {
  if (e.record.getInt("capacidade_simultanea") !== e.record.original().getInt("capacidade_simultanea")) {
    require(`${__hooks}/lib.js`).sinalizarFila(e.app, e.record.id);
  }
  e.next();
}, "empresas");

// ------------------------------------------------------- visão pública
// GET /api/lr/fila-publica/{slug}
// Só primeiro nome + 3 últimos caracteres da placa, status e previsão.
// Reservas aparecem como "Reservado". Com login de cliente, marca a própria entrada.
routerAdd("GET", "/api/lr/fila-publica/{slug}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, e.request.pathValue("slug"));
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");

  const calc = lib.calcularPrevisoes(e.app, empresa);
  const servicosCache = {};
  const nomeServico = (id) => {
    if (!(id in servicosCache)) {
      try {
        servicosCache[id] = e.app.findRecordById("servicos", id).getString("nome");
      } catch (_) {
        servicosCache[id] = "";
      }
    }
    return servicosCache[id];
  };
  const usuariosCache = {};
  const primeiroNome = (r) => {
    let nome = r.getString("nome_avulso");
    const cliente = r.getString("cliente");
    if (cliente) {
      if (!(cliente in usuariosCache)) {
        try {
          usuariosCache[cliente] = e.app.findRecordById("usuarios", cliente).getString("nome");
        } catch (_) {
          usuariosCache[cliente] = "";
        }
      }
      nome = usuariosCache[cliente];
    }
    return String(nome || "").trim().split(/\s+/)[0] || "Cliente";
  };
  const finalPlaca = (r) => {
    const v = r.getString("veiculo");
    if (v) {
      try {
        return e.app.findRecordById("veiculos", v).getString("final_placa");
      } catch (_) {}
    }
    return r.getString("final_placa_avulsa") || "";
  };

  const authId = e.auth ? e.auth.id : "";
  const toleranciaMin = empresa.getInt("tolerancia_min") || 0;
  const saida = { lavando: [], fila: [], prontos: [] };
  let posicao = 0;
  for (const r of calc.ativos) {
    const status = r.getString("status");
    const reservado = r.getString("origem") === "reserva";
    const minha = !!authId && r.getString("cliente") === authId;
    const item = {
      id: r.id,
      status: status,
      reservado: reservado,
      nome: reservado && !minha ? "Reservado" : primeiroNome(r),
      final_placa: reservado && !minha ? "" : finalPlaca(r),
      servico: nomeServico(r.getString("servico")),
      quer_busca: r.getBool("quer_busca"),
      minha: minha,
    };
    if (status === "lavando") {
      item.inicio_em = r.getString("inicio_em");
      saida.lavando.push(item);
    } else if (status === "pronto") {
      saida.prontos.push(item);
    } else {
      posicao++;
      item.posicao = posicao;
      item.previsao = new Date(calc.previsoes[r.id]).toISOString();
      item.atrasado_min = lib.minutosAtraso(r, empresa, calc.agora);
      saida.fila.push(item);
    }
  }

  return e.json(200, {
    empresa: empresa.id,
    agora: new Date(calc.agora).toISOString(),
    capacidade: Math.max(1, empresa.getInt("capacidade_simultanea") || 2),
    tolerancia_min: toleranciaMin,
    // Quem entrar agora começa por volta deste horário
    proxima_vaga: new Date(calc.proximaVaga).toISOString(),
    lavando: saida.lavando,
    fila: saida.fila,
    prontos: saida.prontos,
  });
});

// ------------------------------------------------- entrar na fila (cliente)
// POST /api/lr/fila/entrar { slug, servico, veiculo, quer_busca, observacao }
routerAdd("POST", "/api/lr/fila/entrar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ slug: "", servico: "", veiculo: "", quer_busca: false, observacao: "", itens: [] });
  e.bindBody(body);

  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, body.slug);
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");
  const vinculo = lib.acharVinculo(e.app, e.auth.id, empresa.id);
  if (!vinculo || !vinculo.getBool("ativo")) throw new ForbiddenError("Seu acesso a este lava rápido está desativado.");

  let servico;
  try {
    servico = e.app.findRecordById("servicos", String(body.servico || ""));
  } catch (_) {}
  if (!servico || servico.getString("empresa") !== empresa.id || !servico.getBool("ativo")) {
    throw new BadRequestError("Escolha um serviço.");
  }
  let veiculo;
  try {
    veiculo = e.app.findRecordById("veiculos", String(body.veiculo || ""));
  } catch (_) {}
  if (!veiculo || veiculo.getString("cliente") !== e.auth.id || !veiculo.getBool("ativo")) {
    throw new BadRequestError("Escolha o veículo.");
  }
  // Carrinho (opcional, sem pagamento): vira a lista de produtos a separar na OS.
  const carrinho = lib.validarItens(e.app, empresa.id, body.itens, 20);

  let entrada = null;
  e.app.runInTransaction((tx) => {
    // 1 entrada ativa por cliente por empresa (evita fila falsa).
    const ativas = tx.findRecordsByFilter(
      "fila_entradas",
      "empresa = {:e} && cliente = {:c} && (" + lib.STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")",
      "", 1, 0, { e: empresa.id, c: e.auth.id },
    );
    if (ativas.length > 0) throw new BadRequestError("Você já está na fila deste lava rápido.");

    const pos = lib.posicaoNovaEntrada(lib.carregarFila(tx, empresa), servico.getInt("duracao_media_min"));
    entrada = new Record(tx.findCollectionByNameOrId("fila_entradas"));
    entrada.set("empresa", empresa.id);
    entrada.set("cliente", e.auth.id);
    entrada.set("veiculo", veiculo.id);
    entrada.set("servico", servico.id);
    entrada.set("duracao_min", servico.getInt("duracao_media_min"));
    // Tipo do veículo: sai do cadastro do carro (porte / motorista de app) ou do que a equipe definiu.
    const tipoId = lib.tipoDoCarro(empresa, vinculo, veiculo);
    const temApp = lib.tiposVeiculo(empresa).some((t) => t.vale === "app");
    entrada.set("app_conferir", veiculo.getBool("app_motorista") && temApp && !lib.mapaTipos(vinculo)[veiculo.id]);
    lib.aplicarTipo(entrada, servico, empresa, tipoId);
    entrada.set("origem", "app");
    entrada.set("status", "pendente");
    entrada.set("ordem", lib.ordemAntesDe(tx, empresa.id, pos.lista, pos.p));
    entrada.set("quer_busca", !!body.quer_busca && empresa.getBool("oferece_busca"));
    entrada.set("observacao", String(body.observacao || "").trim().slice(0, 300));
    tx.save(entrada);

    const colItens = tx.findCollectionByNameOrId("itens_pedido");
    for (const it of carrinho) {
      const ip = new Record(colItens);
      ip.set("empresa", empresa.id);
      ip.set("entrada", entrada.id);
      ip.set("produto", it.produto.id);
      ip.set("produto_nome", it.produto.getString("nome"));
      ip.set("quantidade", it.quantidade);
      ip.set("preco_unitario", it.produto.getFloat("preco"));
      ip.set("status", "pendente");
      tx.save(ip);
    }
  });

  return e.json(201, { id: entrada.id });
}, $apis.requireAuth("usuarios"));

// --------------------------------------------------- cliente de balcão
// POST /api/lr/fila/balcao { empresa, servico, nome, celular, final_placa, veiculo_desc, observacao }
// Quem gere a fila coloca no fim da fila um cliente que chegou sem o app.
routerAdd("POST", "/api/lr/fila/balcao", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({
    empresa: "", servico: "", nome: "", celular: "", final_placa: "", veiculo_desc: "", observacao: "", tipo_veiculo: "",
  });
  e.bindBody(body);

  const empresaId = String(body.empresa || "");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!lib.podeGerirFila(vinculo)) throw new ForbiddenError("Você não tem permissão para gerir a fila.");

  let servico;
  try {
    servico = e.app.findRecordById("servicos", String(body.servico || ""));
  } catch (_) {}
  if (!servico || servico.getString("empresa") !== empresaId || !servico.getBool("ativo")) {
    throw new BadRequestError("Escolha um serviço.");
  }
  const nome = String(body.nome || "").trim();
  const finalPlaca = String(body.final_placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-3);
  const celular = lib.normalizarCelular(body.celular);
  if (nome.length < 2) throw new BadRequestError("Informe o nome do cliente.");
  if (finalPlaca.length !== 3) throw new BadRequestError("Informe os 3 últimos caracteres da placa.");
  if (celular && !lib.celularValido(celular)) throw new BadRequestError("Celular inválido. Use DDD + número.");

  const empresa = e.app.findRecordById("empresas", empresaId);
  let entrada = null;
  e.app.runInTransaction((tx) => {
    const pos = lib.posicaoNovaEntrada(lib.carregarFila(tx, empresa), servico.getInt("duracao_media_min"));
    entrada = new Record(tx.findCollectionByNameOrId("fila_entradas"));
    entrada.set("empresa", empresaId);
    entrada.set("servico", servico.id);
    entrada.set("duracao_min", servico.getInt("duracao_media_min"));
    lib.aplicarTipo(entrada, servico, empresa, String(body.tipo_veiculo || ""));
    entrada.set("origem", "balcao");
    entrada.set("status", "confirmado");
    entrada.set("confirmado_por", e.auth.id);
    entrada.set("confirmado_em", lib.agoraISO());
    entrada.set("ordem", lib.ordemAntesDe(tx, empresaId, pos.lista, pos.p));
    entrada.set("previsao_inicio", new Date(pos.previsao).toISOString().replace("T", " "));
    entrada.set("nome_avulso", nome);
    entrada.set("celular_avulso", celular);
    entrada.set("final_placa_avulsa", finalPlaca);
    entrada.set("veiculo_avulso", String(body.veiculo_desc || "").trim().slice(0, 90));
    entrada.set("observacao", String(body.observacao || "").trim().slice(0, 300));
    tx.save(entrada);
    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: "fila_balcao",
      entidade: "fila_entradas", entidade_id: entrada.id, depois: lib.resumoEntrada(entrada),
    });
  });

  return e.json(201, { id: entrada.id });
}, $apis.requireAuth("usuarios"));

// --------------------------------------------------------- ações na fila
// POST /api/lr/fila/{id}/{acao}  { lavado_por?, motivo? }
//   gestao = patrão, gerente ou responsável pela fila
//   equipe = qualquer pessoa ativa da equipe
//   cliente = o próprio cliente da entrada
routerAdd("POST", "/api/lr/fila/{id}/{acao}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const ACOES = {
    confirmar: { de: ["pendente"], para: "confirmado", quem: "gestao", data: "confirmado_em" },
    recusar: { de: ["pendente"], para: "recusado", quem: "gestao", data: "cancelado_em" },
    avisar: { de: ["confirmado", "avisado"], para: "avisado", quem: "equipe", data: "avisado_em" },
    chegou: { de: ["confirmado", "avisado"], para: "no_local", quem: "equipe", data: "chegada_em" },
    iniciar: { de: ["confirmado", "avisado", "no_local"], para: "lavando", quem: "equipe", data: "inicio_em" },
    pronto: { de: ["lavando"], para: "pronto", quem: "equipe", data: "pronto_em" },
    finalizar: { de: ["lavando", "pronto"], para: "finalizado", quem: "equipe", data: "finalizado_em" },
    cancelar: { de: lib.STATUS_ESPERA, para: "cancelado", quem: "gestao_ou_cliente", data: "cancelado_em" },
  };
  const nomeAcao = e.request.pathValue("acao");
  const acao = ACOES[nomeAcao];
  if (!acao) throw new NotFoundError("Ação desconhecida.");

  const body = new DynamicModel({ lavado_por: "", motivo: "" });
  e.bindBody(body);

  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Entrada da fila não encontrada.");
  }
  const empresaId = entrada.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  const ehCliente = entrada.getString("cliente") === e.auth.id;

  let permitido = false;
  if (acao.quem === "equipe") permitido = !!vinculo;
  if (acao.quem === "gestao") permitido = lib.podeGerirFila(vinculo);
  if (acao.quem === "gestao_ou_cliente") permitido = lib.podeGerirFila(vinculo) || ehCliente;
  if (!permitido) {
    // Não revela que a entrada existe para quem não é da empresa.
    if (!vinculo && !ehCliente) throw new NotFoundError("Entrada da fila não encontrada.");
    throw new ForbiddenError("Você não tem permissão para esta ação.");
  }

  const statusAtual = entrada.getString("status");
  if (acao.de.indexOf(statusAtual) < 0) {
    throw new BadRequestError("Esta ação não vale para um carro com status '" + statusAtual + "'. Atualize a tela.");
  }

  const antes = lib.resumoEntrada(entrada);
  const extra = {};
  const motivo = String(body.motivo || "").trim().slice(0, 300);

  e.app.runInTransaction((tx) => {
    entrada.set("status", acao.para);
    entrada.set(acao.data, lib.agoraISO());
    if (nomeAcao === "confirmar") {
      entrada.set("confirmado_por", e.auth.id);
      const calc = lib.calcularPrevisoes(tx, tx.findRecordById("empresas", empresaId));
      if (calc.previsoes[entrada.id]) {
        entrada.set("previsao_inicio", new Date(calc.previsoes[entrada.id]).toISOString().replace("T", " "));
      }
    }
    if (nomeAcao === "recusar" || nomeAcao === "cancelar") {
      entrada.set("cancelado_por", e.auth.id);
      if (motivo) entrada.set("motivo", motivo);
    }
    if (nomeAcao === "iniciar") {
      // Quem estava na frente e já passou da tolerância perde a vez para quem
      // está no local (regra 7). Pular alguém que NÃO está atrasado fica registrado.
      const empresa = tx.findRecordById("empresas", empresaId);
      const agora = Date.now();
      const naFrente = Array.from(tx.findRecordsByFilter(
        "fila_entradas",
        "empresa = {:e} && ordem < {:o} && (" + lib.STATUS_ESPERA.map((s) => "status = '" + s + "'").join(" || ") + ")",
        "", 0, 0, { e: empresaId, o: entrada.getFloat("ordem") },
      ));
      const atrasados = naFrente.filter((r) => lib.minutosAtraso(r, empresa, agora) > 0);
      if (atrasados.length) extra.passou_atrasados = atrasados.length;
      if (naFrente.length - atrasados.length > 0) extra.fora_de_ordem = naFrente.length - atrasados.length;
    }
    if (nomeAcao === "finalizar") {
      const lavador = String(body.lavado_por || e.auth.id);
      if (!lib.vinculoEquipe(tx, lavador, empresaId)) throw new BadRequestError("Escolha quem lavou o carro.");
      entrada.set("lavado_por", lavador);
      entrada.set("finalizado_por", e.auth.id);
      if (!entrada.getString("inicio_em")) entrada.set("inicio_em", lib.agoraISO());
      extra.lavado_por = lavador;
    }
    tx.save(entrada);
    lib.auditar(tx, {
      empresa: empresaId,
      usuario: e.auth.id,
      acao: "fila_" + nomeAcao,
      entidade: "fila_entradas",
      entidade_id: entrada.id,
      antes: antes,
      depois: Object.assign(lib.resumoEntrada(entrada), extra),
      motivo: motivo,
    });
  });

  // Aviso no celular do cliente (Etapa 6).
  const tipoAviso = { confirmar: "confirmada", avisar: "aviso_vez", pronto: "pronto", finalizar: "avaliacao" }[nomeAcao];
  if (tipoAviso) lib.notificarEntrada(e.app, entrada, tipoAviso, { repetir: nomeAcao === "avisar" });

  return e.json(200, { id: entrada.id, status: entrada.getString("status") });
}, $apis.requireAuth("usuarios"));

// ================================================================ ETAPA 3

// ------------------------------------------------------ horário reservado
// POST /api/lr/fila/reserva { empresa, horario, servico, nome?, celular?, final_placa?, veiculo_desc?, observacao? }
// Patrão, gerente ou responsável pela fila. A reserva entra na posição cuja
// previsão bate com o horário. O público vê só "Reservado". Os dados do
// cliente podem ser preenchidos depois (rota /dados).
routerAdd("POST", "/api/lr/fila/reserva", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({
    empresa: "", horario: "", servico: "", nome: "", celular: "", final_placa: "", veiculo_desc: "", observacao: "", tipo_veiculo: "",
  });
  e.bindBody(body);

  const empresaId = String(body.empresa || "");
  if (!lib.podeGerirFila(lib.vinculoEquipe(e.app, e.auth.id, empresaId))) {
    throw new ForbiddenError("Você não tem permissão para gerir a fila.");
  }
  const empresa = e.app.findRecordById("empresas", empresaId);
  let servico;
  try {
    servico = e.app.findRecordById("servicos", String(body.servico || ""));
  } catch (_) {}
  if (!servico || servico.getString("empresa") !== empresaId || !servico.getBool("ativo")) {
    throw new BadRequestError("Escolha um serviço.");
  }
  const horario = Date.parse(String(body.horario || ""));
  const agora = Date.now();
  if (isNaN(horario)) throw new BadRequestError("Informe o horário da reserva.");
  if (horario < agora - 5 * 60000) throw new BadRequestError("O horário da reserva já passou.");
  if (horario > agora + 30 * 24 * 3600000) throw new BadRequestError("Reservas só até 30 dias para a frente.");

  const celular = lib.normalizarCelular(body.celular);
  if (celular && !lib.celularValido(celular)) throw new BadRequestError("Celular inválido. Use DDD + número.");
  const finalPlaca = String(body.final_placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-3);
  if (finalPlaca && finalPlaca.length !== 3) throw new BadRequestError("Informe os 3 últimos caracteres da placa.");

  let entrada = null;
  let previsao = 0;
  e.app.runInTransaction((tx) => {
    const pos = lib.posicaoReserva(lib.carregarFila(tx, empresa), horario, servico.getInt("duracao_media_min"));
    previsao = pos.previsao;
    entrada = new Record(tx.findCollectionByNameOrId("fila_entradas"));
    entrada.set("empresa", empresaId);
    entrada.set("servico", servico.id);
    entrada.set("duracao_min", servico.getInt("duracao_media_min"));
    lib.aplicarTipo(entrada, servico, e.app.findRecordById("empresas", empresaId), String(body.tipo_veiculo || ""));
    entrada.set("origem", "reserva");
    entrada.set("status", "confirmado");
    entrada.set("confirmado_por", e.auth.id);
    entrada.set("confirmado_em", lib.agoraISO());
    entrada.set("horario_reserva", new Date(horario).toISOString().replace("T", " "));
    entrada.set("previsao_inicio", new Date(pos.previsao).toISOString().replace("T", " "));
    entrada.set("ordem", lib.ordemAntesDe(tx, empresaId, pos.lista, pos.p));
    lib.preencherDadosAvulsos(tx, entrada, empresaId, {
      nome: body.nome, celular: celular, final_placa: finalPlaca, veiculo_desc: body.veiculo_desc, observacao: body.observacao,
    });
    tx.save(entrada);
    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: "fila_reserva",
      entidade: "fila_entradas", entidade_id: entrada.id,
      depois: Object.assign(lib.resumoEntrada(entrada), { horario: entrada.getString("horario_reserva") }),
    });
  });

  return e.json(201, { id: entrada.id, previsao: new Date(previsao).toISOString() });
}, $apis.requireAuth("usuarios"));

// ------------------------------------- completar dados (reserva/balcão)
// POST /api/lr/fila/{id}/dados { nome, celular, final_placa, veiculo_desc, observacao }
routerAdd("POST", "/api/lr/fila/{id}/dados", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ nome: "", celular: "", final_placa: "", veiculo_desc: "", observacao: "" });
  e.bindBody(body);
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Entrada da fila não encontrada.");
  }
  const empresaId = entrada.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!vinculo) throw new NotFoundError("Entrada da fila não encontrada.");
  if (!lib.podeGerirFila(vinculo)) throw new ForbiddenError("Você não tem permissão para gerir a fila.");
  if (lib.STATUS_ATIVOS.indexOf(entrada.getString("status")) < 0) throw new BadRequestError("Esta entrada não está mais na fila.");
  if (entrada.getString("origem") === "app") throw new BadRequestError("Os dados de quem entrou pelo app são do próprio cliente.");

  const celular = lib.normalizarCelular(body.celular);
  if (celular && !lib.celularValido(celular)) throw new BadRequestError("Celular inválido. Use DDD + número.");
  const finalPlaca = String(body.final_placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-3);
  if (finalPlaca && finalPlaca.length !== 3) throw new BadRequestError("Informe os 3 últimos caracteres da placa.");

  const antes = {
    nome: entrada.getString("nome_avulso"), celular: entrada.getString("celular_avulso"),
    final_placa: entrada.getString("final_placa_avulsa"), cliente: entrada.getString("cliente"),
  };
  e.app.runInTransaction((tx) => {
    lib.preencherDadosAvulsos(tx, entrada, empresaId, {
      nome: body.nome, celular: celular, final_placa: finalPlaca, veiculo_desc: body.veiculo_desc, observacao: body.observacao,
    });
    tx.save(entrada);
    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: "fila_dados",
      entidade: "fila_entradas", entidade_id: entrada.id, antes: antes,
      depois: {
        nome: entrada.getString("nome_avulso"), celular: entrada.getString("celular_avulso"),
        final_placa: entrada.getString("final_placa_avulsa"), cliente: entrada.getString("cliente"),
      },
    });
  });
  return e.json(200, { id: entrada.id });
}, $apis.requireAuth("usuarios"));

// ------------------------------------------------------------ reposicionar
// POST /api/lr/fila/{id}/reposicionar { minutos, simular? }
// Cliente atrasado não é punido: o responsável informa em quantos minutos ele
// chega e o app mostra/aplica a posição em que ele se encaixa. Nunca vai para a frente.
routerAdd("POST", "/api/lr/fila/{id}/reposicionar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ minutos: 0, simular: false, motivo: "" });
  e.bindBody(body);
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Entrada da fila não encontrada.");
  }
  const empresaId = entrada.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!vinculo) throw new NotFoundError("Entrada da fila não encontrada.");
  if (!lib.podeGerirFila(vinculo)) throw new ForbiddenError("Você não tem permissão para gerir a fila.");
  const st = entrada.getString("status");
  if (["pendente", "confirmado", "avisado"].indexOf(st) < 0) {
    throw new BadRequestError("Só dá para reposicionar quem ainda não chegou.");
  }
  const minutos = parseInt(body.minutos, 10);
  if (!minutos || minutos < 1 || minutos > 600) throw new BadRequestError("Informe em quantos minutos o cliente chega.");

  const empresa = e.app.findRecordById("empresas", empresaId);
  const chegada = Date.now() + minutos * 60000;
  let resultado = null;
  e.app.runInTransaction((tx) => {
    const estado = lib.carregarFila(tx, empresa);
    const posAtual = estado.espera.findIndex((r) => r.id === entrada.id);
    const pos = lib.posicaoReposicionar(estado, entrada.id, chegada);
    resultado = {
      posicao_atual: posAtual + 1,
      nova_posicao: pos.p + 1,
      previsao: new Date(pos.previsao).toISOString(),
    };
    if (body.simular) return;

    const antes = lib.resumoEntrada(entrada);
    if (pos.p !== posAtual) entrada.set("ordem", lib.ordemAntesDe(tx, empresaId, pos.lista, pos.p));
    entrada.set("chegada_prevista", new Date(chegada).toISOString().replace("T", " "));
    entrada.set("reposicionado_em", lib.agoraISO());
    // Novo combinado: o aviso anterior deixa de valer para o cálculo de atraso.
    entrada.set("avisado_em", "");
    if (st === "avisado") entrada.set("status", "confirmado");
    tx.save(entrada);
    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: "fila_reposicionar",
      entidade: "fila_entradas", entidade_id: entrada.id, antes: antes,
      depois: Object.assign(lib.resumoEntrada(entrada), {
        chega_em_min: minutos, posicao_antes: resultado.posicao_atual, posicao_depois: resultado.nova_posicao,
      }),
      motivo: String(body.motivo || "").trim().slice(0, 300),
    });
  });
  return e.json(200, resultado);
}, $apis.requireAuth("usuarios"));

// ---------------------------------------------------- cancelar e substituir
// POST /api/lr/fila/{id}/substituir { servico, nome, final_placa, veiculo_desc, celular, motivo }
// Só no momento do cancelamento: coloca na MESMA posição um cliente que está no local.
routerAdd("POST", "/api/lr/fila/{id}/substituir", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ servico: "", nome: "", final_placa: "", veiculo_desc: "", celular: "", motivo: "", tipo_veiculo: "" });
  e.bindBody(body);
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Entrada da fila não encontrada.");
  }
  const empresaId = entrada.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!vinculo) throw new NotFoundError("Entrada da fila não encontrada.");
  if (!lib.podeGerirFila(vinculo)) throw new ForbiddenError("Você não tem permissão para gerir a fila.");
  if (lib.STATUS_ESPERA.indexOf(entrada.getString("status")) < 0) {
    throw new BadRequestError("Só dá para substituir quem ainda está esperando na fila.");
  }

  let servico;
  try {
    servico = e.app.findRecordById("servicos", String(body.servico || ""));
  } catch (_) {}
  if (!servico || servico.getString("empresa") !== empresaId || !servico.getBool("ativo")) {
    throw new BadRequestError("Escolha o serviço do cliente que vai entrar.");
  }
  const nome = String(body.nome || "").trim();
  const finalPlaca = String(body.final_placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-3);
  const celular = lib.normalizarCelular(body.celular);
  if (nome.length < 2) throw new BadRequestError("Informe o nome de quem vai entrar.");
  if (finalPlaca.length !== 3) throw new BadRequestError("Informe os 3 últimos caracteres da placa.");
  if (celular && !lib.celularValido(celular)) throw new BadRequestError("Celular inválido. Use DDD + número.");
  const motivo = String(body.motivo || "").trim().slice(0, 300);

  let nova = null;
  e.app.runInTransaction((tx) => {
    const antes = lib.resumoEntrada(entrada);
    nova = new Record(tx.findCollectionByNameOrId("fila_entradas"));
    nova.set("empresa", empresaId);
    nova.set("servico", servico.id);
    nova.set("duracao_min", servico.getInt("duracao_media_min"));
    lib.aplicarTipo(nova, servico, tx.findRecordById("empresas", empresaId), String(body.tipo_veiculo || ""));
    nova.set("origem", "substituicao");
    nova.set("status", "no_local");
    nova.set("ordem", entrada.getFloat("ordem"));
    nova.set("confirmado_por", e.auth.id);
    nova.set("confirmado_em", lib.agoraISO());
    nova.set("chegada_em", lib.agoraISO());
    nova.set("substituiu_entrada", entrada.id);
    nova.set("nome_avulso", nome);
    nova.set("celular_avulso", celular);
    nova.set("final_placa_avulsa", finalPlaca);
    nova.set("veiculo_avulso", String(body.veiculo_desc || "").trim().slice(0, 90));
    tx.save(nova);

    entrada.set("status", "substituido");
    entrada.set("cancelado_em", lib.agoraISO());
    entrada.set("cancelado_por", e.auth.id);
    entrada.set("substituido_por", nova.id);
    if (motivo) entrada.set("motivo", motivo);
    tx.save(entrada);

    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: "fila_substituir",
      entidade: "fila_entradas", entidade_id: entrada.id, antes: antes,
      depois: Object.assign(lib.resumoEntrada(entrada), { substituto: nova.id, substituto_nome: nome }),
      motivo: motivo,
    });
  });
  return e.json(201, { id: nova.id, substituida: entrada.id });
}, $apis.requireAuth("usuarios"));

// Tempo real: o próprio PocketBase já manda "X-Accel-Buffering: no" e "Cache-Control: no-store"
// na conexão. (Um hook antigo aqui quebrava a conexão; o app seguia pela consulta a cada 10 s.)

// ------------------------------------------------------- tipo do veículo
// POST /api/lr/fila/{id}/tipo { tipo, lembrar }
// Quem gere a fila (dono, gerente, responsável) define o tipo do veículo da entrada
// (o preço do serviço muda junto). "lembrar" guarda para as próximas vezes deste carro.
routerAdd("POST", "/api/lr/fila/{id}/tipo", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ tipo: "", lembrar: false });
  e.bindBody(body);
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("id"));
  } catch (_) {
    throw new NotFoundError("Entrada da fila não encontrada.");
  }
  const empresaId = entrada.getString("empresa");
  const vinculo = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!vinculo) throw new NotFoundError("Entrada da fila não encontrada.");
  if (!lib.podeGerirFila(vinculo)) throw new ForbiddenError("Só quem gere a fila define o tipo do veículo.");
  if (lib.STATUS_ATIVOS.indexOf(entrada.getString("status")) < 0) throw new BadRequestError("Esta entrada não está mais na fila.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const tipo = String(body.tipo || "");
  if (tipo && !lib.acharTipo(empresa, tipo)) throw new BadRequestError("Tipo de veículo não encontrado.");
  const servico = e.app.findRecordById("servicos", entrada.getString("servico"));
  const antes = { tipo: entrada.getString("tipo_veiculo_nome"), preco: entrada.getFloat("preco_servico") };
  // Motorista de app: a equipe pode dar o desconto nesta lavagem, mas guardar para as próximas
  // vezes (ou tirar uma aprovação) é só com o dono.
  if (body.lembrar && entrada.getString("cliente") && entrada.getString("veiculo") && !lib.ehPatraoAtivo(e.app, e.auth.id, empresaId)) {
    const vc = lib.acharVinculo(e.app, entrada.getString("cliente"), empresaId);
    const atual = vc ? lib.acharTipo(empresa, lib.mapaTipos(vc)[entrada.getString("veiculo")]) : null;
    const novo = lib.acharTipo(empresa, tipo);
    if ((novo && novo.vale === "app") || (atual && atual.vale === "app")) {
      throw new ForbiddenError("Motorista de app: o desconto vale nesta lavagem. Para as próximas vezes, quem aprova o carro é o dono.");
    }
  }
  e.app.runInTransaction((tx) => {
    lib.aplicarTipo(entrada, servico, empresa, tipo);
    tx.save(entrada);
    const clienteId = entrada.getString("cliente");
    const veiculoId = entrada.getString("veiculo");
    if (body.lembrar && clienteId && veiculoId) {
      const vc = lib.acharVinculo(tx, clienteId, empresaId);
      if (vc) {
        let mapa = {};
        try {
          mapa = JSON.parse(vc.getString("tipos_veiculos") || "{}") || {};
        } catch (_) {}
        if (tipo) mapa[veiculoId] = tipo;
        else delete mapa[veiculoId];
        vc.set("tipos_veiculos", mapa);
        tx.unsafeWithoutHooks().save(vc);
      }
    }
    lib.auditar(tx, {
      empresa: empresaId, usuario: e.auth.id, acao: "fila_tipo_veiculo", entidade: "fila_entradas", entidade_id: entrada.id,
      antes: antes, depois: { tipo: entrada.getString("tipo_veiculo_nome"), preco: entrada.getFloat("preco_servico"), lembrar: !!body.lembrar },
    });
  });
  return e.json(200, { tipo_veiculo: entrada.getString("tipo_veiculo"), tipo_veiculo_nome: entrada.getString("tipo_veiculo_nome"), preco_servico: entrada.getFloat("preco_servico") });
}, $apis.requireAuth("usuarios"));

// ------------------------------------------- motorista de app: aprovação do dono
// GET /api/lr/app-pendentes/{empresa}: carros que receberam desconto de app na fila (conferido
// pela equipe) e ainda não foram aprovados nem recusados pelo dono. Só o dono.
routerAdd("GET", "/api/lr/app-pendentes/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  if (!lib.ehPatraoAtivo(e.app, e.auth.id, empresaId)) throw new ForbiddenError("Só o dono aprova motorista de app.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const app = lib.tiposVeiculo(empresa).find((t) => t.vale === "app");
  if (!app) return e.json(200, { pendentes: [] });
  const desde = new Date(Date.now() - 90 * 86400000).toISOString().replace("T", " ");
  const entradas = e.app.findRecordsByFilter(
    "fila_entradas", "empresa = {:e} && tipo_veiculo = {:t} && veiculo != '' && cliente != '' && status != 'cancelado' && created >= {:d}",
    "-created", 200, 0, { e: empresaId, t: app.id, d: desde },
  );
  const porCarro = {};
  for (const en of entradas) {
    const vid = en.getString("veiculo");
    if (porCarro[vid]) {
      porCarro[vid].vezes++;
      continue;
    }
    const vc = lib.acharVinculo(e.app, en.getString("cliente"), empresaId);
    if (!vc || lib.mapaTipos(vc)[vid]) continue; // já aprovado ou recusado
    let v, u;
    try {
      v = e.app.findRecordById("veiculos", vid);
      u = e.app.findRecordById("usuarios", en.getString("cliente"));
    } catch (_) {
      continue;
    }
    porCarro[vid] = {
      veiculo: vid, cliente: u.getString("nome"), celular: u.getString("celular"),
      placa: v.getString("placa") || "…" + v.getString("final_placa"), modelo: v.getString("modelo"), cor: v.getString("cor"),
      ultima: en.getString("created"), vezes: 1,
    };
  }
  return e.json(200, { tipo: app.nome, pendentes: Object.keys(porCarro).map((k) => porCarro[k]) });
}, $apis.requireAuth("usuarios"));

// POST /api/lr/app-aprovar { empresa, veiculo, aprovar }: o dono aprova (desconto automático
// daí em diante, só para este carro e só neste lava rápido) ou recusa (preço pelo tamanho).
routerAdd("POST", "/api/lr/app-aprovar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ empresa: "", veiculo: "", aprovar: false });
  e.bindBody(body);
  const empresaId = String(body.empresa || "");
  if (!lib.ehPatraoAtivo(e.app, e.auth.id, empresaId)) throw new ForbiddenError("Só o dono aprova motorista de app.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const app = lib.tiposVeiculo(empresa).find((t) => t.vale === "app");
  if (!app) throw new BadRequestError("Crie antes o tipo 'Motorista de app' em Serviços.");
  let v;
  try {
    v = e.app.findRecordById("veiculos", String(body.veiculo || ""));
  } catch (_) {
    throw new NotFoundError("Carro não encontrado.");
  }
  const vc = lib.acharVinculo(e.app, v.getString("cliente"), empresaId);
  if (!vc || vc.getString("papel") !== "cliente") throw new NotFoundError("Carro não encontrado.");
  const mapa = lib.mapaTipos(vc);
  mapa[v.id] = body.aprovar ? app.id : "recusado";
  vc.set("tipos_veiculos", mapa);
  e.app.unsafeWithoutHooks().save(vc);
  lib.auditar(e.app, {
    empresa: empresaId, usuario: e.auth.id, acao: body.aprovar ? "app_aprovado" : "app_recusado", entidade: "veiculos", entidade_id: v.id,
    depois: { placa: v.getString("placa") || v.getString("final_placa"), modelo: v.getString("modelo") },
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));
