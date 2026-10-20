/// <reference path="../pb_data/types.d.ts" />
// ETAPA 7 — Câmeras (só o patrão).
//
// O celular nunca recebe o endereço nem o token do gateway. O patrão pede um passe
// (POST /api/lr/cameras/{id}/acesso), válido por 10 minutos e só para aquela câmera;
// a imagem/vídeo passa pelo servidor em GET /api/lr/cameras/{id}/ver/{passe}/...

// ------------------------------------------------------------- cadastro
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  lib.validarCamera(e.record);
  // Campos do sensor são do servidor: a chave é sempre gerada aqui.
  for (const c of lib.CAMPOS_SENSOR) e.record.set(c, "");
  e.record.set("chave_sensor", $security.randomString(40));
  if (!e.record.getInt("sem_movimento_min")) e.record.set("sem_movimento_min", 10);
  e.next();
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "camera_criar",
    entidade: "cameras", entidade_id: e.record.id,
    depois: { nome: e.record.getString("nome"), tipo: e.record.getString("tipo_integracao"), ativo: e.record.getBool("ativo") },
  });
}, "cameras");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const antes = e.record.original();
  lib.validarCamera(e.record);
  if (!e.hasSuperuserAuth()) {
    for (const c of lib.CAMPOS_SENSOR) e.record.set(c, antes.get(c));
    // Ligou o sensor agora: começa a contar daqui (não alerta pelo passado).
    if (e.record.getBool("monitorar_movimento") && !antes.getBool("monitorar_movimento") && e.record.getString("ultimo_sinal_em")) {
      e.record.set("sensor_desde_em", new Date().toISOString().replace("T", " "));
    }
  }
  e.next();
  const resumo = (r) => ({
    nome: r.getString("nome"), tipo: r.getString("tipo_integracao"), ativo: r.getBool("ativo"),
    endereco: r.getString("endereco_stream"), caminho: r.getString("caminho"), link_app: r.getString("link_app"),
    monitorar_movimento: r.getBool("monitorar_movimento"), sem_movimento_min: r.getInt("sem_movimento_min"),
    token_trocado: r.getString("gateway_token") !== antes.getString("gateway_token"),
  });
  const depois = resumo(e.record);
  const a = resumo(antes);
  a.token_trocado = false;
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "camera_editar",
    entidade: "cameras", entidade_id: e.record.id, antes: a, depois: depois,
  });
}, "cameras");

onRecordDeleteRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "camera_excluir",
    entidade: "cameras", entidade_id: e.record.id, antes: { nome: e.record.getString("nome") },
  });
}, "cameras");

// O token do gateway é escondido; o app só fica sabendo se existe um.
onRecordEnrich((e) => {
  e.record.withCustomData(true);
  e.record.set("tem_token", e.record.getString("gateway_token") !== "");
  e.record.hide("gateway_token");
  // Quem só pode VER as câmeras (acesso liberado pelo dono) não vê a configuração.
  // (no evento de enriquecer, requestInfo é um campo, não uma função)
  const auth = e.requestInfo ? e.requestInfo.auth : null;
  const superusuario = !!auth && auth.isSuperuser();
  if (!superusuario && !require(`${__hooks}/lib.js`).ehPatraoAtivo(e.app, auth ? auth.id : "", e.record.getString("empresa"))) {
    e.record.hide("endereco_stream", "caminho", "chave_sensor");
  }
  e.next();
}, "cameras");

// Nem filtrando dá para adivinhar o token.
onRecordsListRequest((e) => {
  const q = e.requestInfo().query || {};
  if ((String(q.filter || "") + " " + String(q.sort || "")).indexOf("gateway_token") >= 0) throw new BadRequestError("Filtro inválido.");
  e.next();
}, "cameras");

// ---------------------------------------------------------------- passe
// POST /api/lr/cameras/{id}/acesso → { tipo, url } ou { tipo, link } (app do fabricante)
routerAdd("POST", "/api/lr/cameras/{id}/acesso", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  let cam;
  try {
    cam = e.app.findRecordById("cameras", e.request.pathValue("id"));
  } catch (_) {}
  if (!cam || !lib.temAcesso(e.app, e.auth.id, cam.getString("empresa"), "cameras")) throw new NotFoundError("Câmera não encontrada.");
  if (!cam.getBool("ativo")) throw new BadRequestError("Esta câmera está desativada.");
  const tipo = cam.getString("tipo_integracao");
  lib.auditar(e.app, { empresa: cam.getString("empresa"), usuario: e.auth.id, acao: "camera_ver", entidade: "cameras", entidade_id: cam.id });
  if (tipo === "app_fabricante") return e.json(200, { tipo: tipo, link: cam.getString("link_app") });
  const passe = $security.createJWT({ cam: cam.id, usr: e.auth.id }, lib.segredoServidor(e.app, "cameras"), lib.PASSE_CAMERA_S);
  return e.json(200, { tipo: tipo, url: "/api/lr/cameras/" + cam.id + "/ver/" + passe + "/", expira_em_s: lib.PASSE_CAMERA_S });
}, $apis.requireAuth("usuarios"));

// ---------------------------------------------------------------- proxy
// GET /api/lr/cameras/{id}/ver/{passe}/            → imagem atual ou playlist HLS
// GET /api/lr/cameras/{id}/ver/{passe}/{arquivo…}  → partes do vídeo HLS (caminho relativo)
routerAdd("GET", "/api/lr/cameras/{id}/ver/{passe}/{arquivo...}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  let cam;
  try {
    cam = e.app.findRecordById("cameras", e.request.pathValue("id"));
  } catch (_) {}
  if (!cam) throw new NotFoundError("Câmera não encontrada.");
  let claims;
  try {
    claims = $security.parseJWT(e.request.pathValue("passe"), lib.segredoServidor(e.app, "cameras"));
  } catch (_) {
    throw new UnauthorizedError("Passe da câmera vencido. Abra a tela de novo.");
  }
  if (claims.cam !== cam.id) throw new ForbiddenError("Passe de outra câmera.");
  if (!cam.getBool("ativo") || !lib.temAcesso(e.app, String(claims.usr || ""), cam.getString("empresa"), "cameras")) {
    throw new ForbiddenError("Sem acesso a esta câmera.");
  }

  const h = e.response.header();
  h.set("Cache-Control", "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");

  const tipo = cam.getString("tipo_integracao");
  const arquivo = e.request.pathValue("arquivo") || "";
  if (tipo === "demonstracao") {
    if (arquivo) throw new NotFoundError("Arquivo não encontrado.");
    return e.blob(200, "image/svg+xml", lib.quadroDemonstracao(cam.getString("nome"), Date.now()));
  }
  if (tipo !== "imagem" && tipo !== "hls") throw new BadRequestError("Esta câmera abre no app do fabricante.");
  if (arquivo && (tipo !== "hls" || !lib.caminhoSeguro(arquivo))) throw new BadRequestError("Arquivo inválido.");

  const base = cam.getString("endereco_stream").replace(/\/+$/, "");
  const caminho = cam.getString("caminho").replace(/^\/+/, "");
  let alvo;
  if (!arquivo) {
    alvo = base + "/" + caminho;
  } else {
    const semQuery = caminho.split("?")[0];
    const pasta = semQuery.substring(0, semQuery.lastIndexOf("/") + 1);
    const q = e.request.url.rawQuery;
    alvo = base + "/" + pasta + arquivo + (q ? "?" + q : "");
  }
  const headers = {};
  if (cam.getString("gateway_token")) headers["Authorization"] = "Bearer " + cam.getString("gateway_token");

  let res;
  try {
    res = $http.send({ url: alvo, method: "GET", headers: headers, timeout: 10 });
  } catch (err) {
    console.log("[câmera] gateway não respondeu", cam.id, err);
    return e.json(502, { message: "A câmera não respondeu. Confira se o gateway está ligado." });
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    console.log("[câmera] gateway respondeu", cam.id, res.statusCode);
    return e.json(502, { message: "A câmera não respondeu (código " + res.statusCode + ")." });
  }
  let tipoConteudo = ((res.headers["Content-Type"] || [])[0] || "application/octet-stream").toLowerCase();
  if (tipoConteudo.indexOf("html") >= 0 || tipoConteudo.indexOf("javascript") >= 0) {
    return e.json(502, { message: "O gateway devolveu um conteúdo que não é imagem nem vídeo." });
  }
  return e.blob(200, tipoConteudo, res.body);
});

// ---------------------------------------------------- sensor de movimento
// POST /api/lr/sensor/{chave}   body {"tipo":"movimento"|"sinal"} ou ?tipo=...
// Chamado pelo DVR (notificação HTTP) ou pelo gateway da loja (deploy/gateway).
// A chave é secreta e única por câmera; sem login (o DVR não tem login do app).
routerAdd("POST", "/api/lr/sensor/{chave}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const chave = e.request.pathValue("chave");
  if (!/^[A-Za-z0-9]{40}$/.test(chave)) throw new NotFoundError("Sensor não encontrado.");
  let cam;
  try {
    cam = e.app.findFirstRecordByData("cameras", "chave_sensor", chave);
  } catch (_) {}
  if (!cam) throw new NotFoundError("Sensor não encontrado.");
  let tipo = e.request.url.query().get("tipo");
  if (!tipo) {
    try {
      tipo = String((e.requestInfo().body || {}).tipo || "");
    } catch (_) {}
  }
  if (tipo !== "sinal") tipo = "movimento";
  if (cam.getBool("ativo")) lib.registrarSensor(e.app, cam, tipo, Date.now());
  return e.noContent(204);
});

// Patrão troca a chave (se vazou ou trocou o gateway).
routerAdd("POST", "/api/lr/cameras/{id}/nova-chave", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  let cam;
  try {
    cam = e.app.findRecordById("cameras", e.request.pathValue("id"));
  } catch (_) {}
  if (!cam || !lib.ehPatraoAtivo(e.app, e.auth.id, cam.getString("empresa"))) throw new NotFoundError("Câmera não encontrada.");
  cam.set("chave_sensor", $security.randomString(40));
  cam.set("ultimo_sinal_em", "");
  cam.set("ultimo_movimento_em", "");
  cam.set("sensor_desde_em", "");
  e.app.unsafeWithoutHooks().save(cam);
  lib.auditar(e.app, { empresa: cam.getString("empresa"), usuario: e.auth.id, acao: "camera_nova_chave_sensor", entidade: "cameras", entidade_id: cam.id });
  return e.json(200, { chave_sensor: cam.getString("chave_sensor") });
}, $apis.requireAuth("usuarios"));

// A cada minuto: área parada no horário de funcionamento ou sensor sem sinal → alerta ao patrão.
cronAdd("lr_sensor_movimento", "* * * * *", () => {
  const lib = require(`${__hooks}/lib.js`);
  lib.verificarSensores($app, Date.now());
});

// Limpeza: guarda 60 dias de histórico de movimento.
cronAdd("lr_sensor_limpeza", "17 4 * * *", () => {
  const limite = new Date(Date.now() - 60 * 86400000).toISOString().replace("T", " ");
  $app.db().newQuery("DELETE FROM camera_eventos WHERE created < {:l}").bind({ l: limite }).execute();
});

// Só para testes: roda a verificação agora (superusuário).
routerAdd("POST", "/api/lr/sensor-verificar", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  return e.json(200, { alertas: lib.verificarSensores(e.app, Date.now()) });
}, $apis.requireSuperuserAuth());
