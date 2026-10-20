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
      saida.fila.push(item);
    }
  }

  return e.json(200, {
    empresa: empresa.id,
    agora: new Date(calc.agora).toISOString(),
    capacidade: Math.max(1, empresa.getInt("capacidade_simultanea") || 2),
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
  const body = new DynamicModel({ slug: "", servico: "", veiculo: "", quer_busca: false, observacao: "" });
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

  let entrada = null;
  e.app.runInTransaction((tx) => {
    // 1 entrada ativa por cliente por empresa (evita fila falsa).
    const ativas = tx.findRecordsByFilter(
      "fila_entradas",
      "empresa = {:e} && cliente = {:c} && (" + lib.STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")",
      "", 1, 0, { e: empresa.id, c: e.auth.id },
    );
    if (ativas.length > 0) throw new BadRequestError("Você já está na fila deste lava rápido.");

    const ultima = tx.findRecordsByFilter("fila_entradas", "empresa = {:e}", "-ordem", 1, 0, { e: empresa.id });
    entrada = new Record(tx.findCollectionByNameOrId("fila_entradas"));
    entrada.set("empresa", empresa.id);
    entrada.set("cliente", e.auth.id);
    entrada.set("veiculo", veiculo.id);
    entrada.set("servico", servico.id);
    entrada.set("duracao_min", servico.getInt("duracao_media_min"));
    entrada.set("preco_servico", servico.getFloat("preco"));
    entrada.set("origem", "app");
    entrada.set("status", "pendente");
    entrada.set("ordem", ultima.length ? ultima[0].getInt("ordem") + 1 : 1);
    entrada.set("quer_busca", !!body.quer_busca);
    entrada.set("observacao", String(body.observacao || "").trim().slice(0, 300));
    tx.save(entrada);
  });

  return e.json(201, { id: entrada.id });
}, $apis.requireAuth("usuarios"));

// --------------------------------------------------- cliente de balcão
// POST /api/lr/fila/balcao { empresa, servico, nome, celular, final_placa, veiculo_desc, observacao }
// Quem gere a fila coloca no fim da fila um cliente que chegou sem o app.
routerAdd("POST", "/api/lr/fila/balcao", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({
    empresa: "", servico: "", nome: "", celular: "", final_placa: "", veiculo_desc: "", observacao: "",
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

  let entrada = null;
  e.app.runInTransaction((tx) => {
    const ultima = tx.findRecordsByFilter("fila_entradas", "empresa = {:e}", "-ordem", 1, 0, { e: empresaId });
    entrada = new Record(tx.findCollectionByNameOrId("fila_entradas"));
    entrada.set("empresa", empresaId);
    entrada.set("servico", servico.id);
    entrada.set("duracao_min", servico.getInt("duracao_media_min"));
    entrada.set("preco_servico", servico.getFloat("preco"));
    entrada.set("origem", "balcao");
    entrada.set("status", "confirmado");
    entrada.set("confirmado_por", e.auth.id);
    entrada.set("confirmado_em", lib.agoraISO());
    entrada.set("ordem", ultima.length ? ultima[0].getInt("ordem") + 1 : 1);
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
    if (nomeAcao === "confirmar") entrada.set("confirmado_por", e.auth.id);
    if (nomeAcao === "recusar" || nomeAcao === "cancelar") {
      entrada.set("cancelado_por", e.auth.id);
      if (motivo) entrada.set("motivo", motivo);
    }
    if (nomeAcao === "iniciar") {
      // Registra quando um carro começa antes de outros que estavam na frente.
      const naFrente = tx.findRecordsByFilter(
        "fila_entradas",
        "empresa = {:e} && ordem < {:o} && (" + lib.STATUS_ESPERA.map((s) => "status = '" + s + "'").join(" || ") + ")",
        "", 0, 0, { e: empresaId, o: entrada.getInt("ordem") },
      );
      if (naFrente.length) extra.fora_de_ordem = naFrente.length;
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

  return e.json(200, { id: entrada.id, status: entrada.getString("status") });
}, $apis.requireAuth("usuarios"));
