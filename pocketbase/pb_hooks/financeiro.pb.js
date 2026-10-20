/// <reference path="../pb_data/types.d.ts" />
// Fotos antes/depois, tipos de veículo e preços, gastos fixos, fechamento do dia e do mês.

// ---------------------------------------------------- tipos de veículo / preços
// Tipos de veículo gravados sempre normalizados (id, nome, "vale para"), ao criar e ao editar.
onRecordCreateRequest((e) => {
  require(`${__hooks}/lib.js`).tiposDoCorpo(e);
  e.next();
}, "empresas");
onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib.js`).tiposDoCorpo(e);
  e.next();
}, "empresas");

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib.js`).limparPrecosTipo(e);
  e.next();
}, "servicos");
onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib.js`).limparPrecosTipo(e);
  e.next();
}, "servicos");

// ------------------------------------------------------------- vistorias
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "vistoria_fotos",
    entidade: "vistorias", entidade_id: e.record.id,
    depois: { entrada: e.record.getString("entrada"), momento: e.record.getString("momento"), fotos: (e.record.get("fotos") || []).length, avarias: e.record.getString("avarias") },
  });
}, "vistorias");

// ------------------------------------------------------------ gastos fixos
onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/lib.js`).lancarGastosFixos(e.app, Date.now(), e.record.getString("empresa"));
  e.next();
}, "gastos_fixos");
onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/lib.js`).lancarGastosFixos(e.app, Date.now(), e.record.getString("empresa"));
  e.next();
}, "gastos_fixos");
// Todo dia às 06:10 (Brasília) lança os gastos fixos que venceram.
cronAdd("lr_gastos_fixos", "10 9 * * *", () => {
  require(`${__hooks}/lib.js`).lancarGastosFixos($app, Date.now(), "");
});

// ----------------------------------------------------- fechamento do dia
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "fechamento_dia_criar",
    entidade: "fechamentos_dia", entidade_id: e.record.id,
    depois: { dia: e.record.getString("dia"), cartao: e.record.getFloat("cartao"), pix: e.record.getFloat("pix"), dinheiro: e.record.getFloat("dinheiro"), anexos: (e.record.get("anexos") || []).length },
  });
}, "fechamentos_dia");
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const o = e.record.original();
  const resumo = (r) => ({ cartao: r.getFloat("cartao"), pix: r.getFloat("pix"), dinheiro: r.getFloat("dinheiro"), anexos: (r.get("anexos") || []).length, observacao: r.getString("observacao") });
  const antes = resumo(o);
  if (e.auth) e.record.set("atualizado_por", e.auth.id);
  e.next();
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth), acao: "fechamento_dia_editar",
    entidade: "fechamentos_dia", entidade_id: e.record.id, antes: antes, depois: resumo(e.record),
  });
}, "fechamentos_dia");

// ------------------------------------------------------ fechamento do mês
// GET /api/lr/fechamento-mes/{empresa}?mes=AAAA-MM   (padrão: mês atual)
routerAdd("GET", "/api/lr/fechamento-mes/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  if (!lib.temAcesso(e.app, e.auth.id, empresaId, "valores")) throw new ForbiddenError("Só dono e gerente (ou quem o dono liberar) veem o fechamento.");
  const agora = Date.now();
  const mes = lib.mesCompetencia(e.request.url.query().get("mes")) || [lib.inicioMesSP(agora), lib.inicioMesSeguinteSP(agora)];
  const dono = lib.ehPatraoAtivo(e.app, e.auth.id, empresaId);
  return e.json(200, lib.fechamentoMes(e.app, empresaId, mes[0], mes[1], dono));
}, $apis.requireAuth("usuarios"));

// ------------------------------------------------- fotos e notas protegidas
// GET /api/lr/arquivo/{colecao}/{id}?nome=arquivo.jpg&token=PASSE_DE_ARQUIVO
// A CDN da Hostinger trata endereço terminado em .png/.jpg como arquivo estático e
// descarta o "?token=" — o /api/files/... protegido então nunca abre. Este endereço não
// termina em extensão e confere o passe e a regra de leitura do próprio registro.
routerAdd("GET", "/api/lr/arquivo/{colecao}/{id}", (e) => {
  const CAMPOS = { vistorias: "fotos", fechamentos_dia: "anexos", orcamentos: "fotos" };
  const colecao = e.request.pathValue("colecao");
  const campo = CAMPOS[colecao];
  const q = e.request.url.query();
  const nome = q.get("nome") || "";
  const naoAchou = () => new NotFoundError("Arquivo não encontrado.");
  if (!campo || !nome) throw naoAchou();
  let record, auth;
  try {
    record = e.app.findRecordById(colecao, e.request.pathValue("id"));
    auth = e.app.findAuthRecordByToken(q.get("token") || "", "file");
  } catch (_) {
    throw naoAchou();
  }
  if ((record.get(campo) || []).indexOf(nome) < 0) throw naoAchou();
  const info = e.requestInfo();
  info.auth = auth;
  if (!e.app.canAccessRecord(record, info, record.collection().viewRule)) throw naoAchou();
  const fsys = e.app.newFilesystem();
  try {
    e.response.header().set("Cache-Control", "private, no-store");
    fsys.serve(e.response, e.request, record.baseFilesPath() + "/" + nome, nome);
  } finally {
    fsys.close();
  }
});
