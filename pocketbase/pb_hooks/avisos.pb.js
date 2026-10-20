/// <reference path="../pb_data/types.d.ts" />
// ETAPA 6 — Avisos no celular (Web Push) e avaliação do cliente.

// Chave pública VAPID (o app usa para se inscrever nas notificações).
routerAdd("GET", "/api/lr/push/chave", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  return e.json(200, { publica: lib.chavesPush(e.app).publica });
});

// Aviso automático "já pode vir": a cada minuto, para quem tem a vez confirmada e
// a previsão chegou dentro da antecedência configurada (padrão 15 min).
cronAdd("lr_aviso_vez", "* * * * *", () => {
  const lib = require(`${__hooks}/lib.js`);
  const agora = Date.now();
  const empresas = $app.findRecordsByFilter("empresas", "ativo = true", "", 0, 0);
  for (const empresa of empresas) {
    try {
      const antecedencia = (empresa.getInt("aviso_min") || 15) * 60000;
      const calc = lib.calcularPrevisoes($app, empresa);
      for (const r of calc.estado.espera) {
        if (!r.getString("cliente") || r.getString("push_aviso_em")) continue;
        if (["confirmado", "avisado"].indexOf(r.getString("status")) < 0) continue;
        const prev = calc.previsoes[r.id];
        if (prev && prev - agora <= antecedencia) lib.notificarEntrada($app, r, "aviso_vez");
      }
    } catch (err) {
      console.log("[aviso automático] erro", empresa.id, err);
    }
  }
});

// ------------------------------------------------------------- avaliação
// POST /api/lr/avaliar { entrada, nota_funcionario, nota_atendimento, nota_ambiente, comentario }
// Só o cliente do carro, depois da baixa, uma vez, em até 30 dias.
routerAdd("POST", "/api/lr/avaliar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ entrada: "", nota_funcionario: 0, nota_atendimento: 0, nota_ambiente: 0, comentario: "" });
  e.bindBody(body);
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", String(body.entrada || ""));
  } catch (_) {}
  if (!entrada || entrada.getString("cliente") !== e.auth.id) throw new NotFoundError("Lavagem não encontrada.");
  if (entrada.getString("status") !== "finalizado") throw new BadRequestError("Só dá para avaliar depois que o carro ficar pronto.");
  if (Date.now() - lib.dataMs(entrada, "finalizado_em") > 30 * 86400000) throw new BadRequestError("O prazo para avaliar esta lavagem acabou.");
  try {
    e.app.findFirstRecordByData("avaliacoes", "entrada", entrada.id);
    throw new BadRequestError("Você já avaliou esta lavagem. Obrigado!");
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }
  const notas = {};
  for (const c of ["nota_funcionario", "nota_atendimento", "nota_ambiente"]) {
    const n = parseInt(body[c], 10);
    if (!(n >= 1 && n <= 5)) throw new BadRequestError("Dê uma nota de 1 a 5 estrelas para cada item.");
    notas[c] = n;
  }
  const r = new Record(e.app.findCollectionByNameOrId("avaliacoes"));
  r.set("empresa", entrada.getString("empresa"));
  r.set("entrada", entrada.id);
  r.set("cliente", e.auth.id);
  if (entrada.getString("lavado_por")) r.set("funcionario", entrada.getString("lavado_por"));
  for (const c of Object.keys(notas)) r.set(c, notas[c]);
  r.set("comentario", String(body.comentario || "").trim().slice(0, 500));
  e.app.save(r);
  return e.json(201, { id: r.id });
}, $apis.requireAuth("usuarios"));

// GET /api/lr/avaliacao/{entrada}: dados para a tela de avaliar (só o cliente do carro).
routerAdd("GET", "/api/lr/avaliacao/{entrada}", (e) => {
  let entrada;
  try {
    entrada = e.app.findRecordById("fila_entradas", e.request.pathValue("entrada"));
  } catch (_) {}
  if (!entrada || entrada.getString("cliente") !== e.auth.id) throw new NotFoundError("Lavagem não encontrada.");
  let ja = false;
  try {
    e.app.findFirstRecordByData("avaliacoes", "entrada", entrada.id);
    ja = true;
  } catch (_) {}
  const nome = (col, id) => {
    try {
      return e.app.findRecordById(col, id).getString("nome");
    } catch (_) {
      return "";
    }
  };
  return e.json(200, {
    entrada: entrada.id,
    status: entrada.getString("status"),
    finalizado_em: entrada.getString("finalizado_em"),
    servico: nome("servicos", entrada.getString("servico")),
    funcionario: String(nome("usuarios", entrada.getString("lavado_por")) || "").split(" ")[0],
    ja_avaliada: ja,
  });
}, $apis.requireAuth("usuarios"));

// GET /api/lr/avaliacao-pendente/{slug}: última lavagem do cliente (até 3 dias) ainda sem avaliação.
routerAdd("GET", "/api/lr/avaliacao-pendente/{slug}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, e.request.pathValue("slug"));
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");
  const desde = new Date(Date.now() - 3 * 86400000).toISOString().replace("T", " ");
  const lista = e.app.findRecordsByFilter(
    "fila_entradas", "empresa = {:e} && cliente = {:c} && status = 'finalizado' && finalizado_em >= {:d}",
    "-finalizado_em", 5, 0, { e: empresa.id, c: e.auth.id, d: desde },
  );
  for (const r of lista) {
    try {
      e.app.findFirstRecordByData("avaliacoes", "entrada", r.id);
    } catch (_) {
      return e.json(200, { entrada: r.id, finalizado_em: r.getString("finalizado_em") });
    }
  }
  return e.json(200, { entrada: "" });
}, $apis.requireAuth("usuarios"));

// GET /api/lr/avaliacoes/{empresa}?funcionario=ID|eu
// Equipe: médias e lista SEM o nome do cliente. Patrão: com o nome.
routerAdd("GET", "/api/lr/avaliacoes/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  const v = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!v) throw new ForbiddenError("Só para a equipe.");
  const patrao = v.getString("papel") === "patrao";
  let funcionario = e.request.url.query().get("funcionario") || "";
  if (funcionario === "eu") funcionario = e.auth.id;
  const filtro = "empresa = {:e}" + (funcionario ? " && funcionario = {:f}" : "");
  const lista = Array.from(e.app.findRecordsByFilter("avaliacoes", filtro, "-created", 200, 0, { e: empresaId, f: funcionario }));
  const nomes = {};
  const nome = (id) => {
    if (!id) return "";
    if (!(id in nomes)) {
      try {
        nomes[id] = e.app.findRecordById("usuarios", id).getString("nome");
      } catch (_) {
        nomes[id] = "";
      }
    }
    return nomes[id];
  };
  const media = (c) => (lista.length ? Math.round((lista.reduce((s, r) => s + r.getInt(c), 0) / lista.length) * 10) / 10 : 0);
  const m = { funcionario: media("nota_funcionario"), atendimento: media("nota_atendimento"), ambiente: media("nota_ambiente") };
  return e.json(200, {
    total: lista.length,
    media: Object.assign(m, { geral: lista.length ? Math.round(((m.funcionario + m.atendimento + m.ambiente) / 3) * 10) / 10 : 0 }),
    lista: lista.slice(0, 100).map((r) => {
      const item = {
        id: r.id,
        criado_em: r.getString("created"),
        nota_funcionario: r.getInt("nota_funcionario"),
        nota_atendimento: r.getInt("nota_atendimento"),
        nota_ambiente: r.getInt("nota_ambiente"),
        comentario: r.getString("comentario"),
        funcionario: String(nome(r.getString("funcionario")) || "").split(" ")[0],
      };
      if (patrao) item.cliente = nome(r.getString("cliente"));
      return item;
    }),
  });
}, $apis.requireAuth("usuarios"));
