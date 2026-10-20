/// <reference path="../pb_data/types.d.ts" />
// ETAPA 5 — Painel do patrão/gerente, área do funcionário e auditoria do financeiro.

// --------------------------------------------------------------- painel
// GET /api/lr/painel/{empresa}?de=ISO&ate=ISO   (padrão: hoje)
// Patrão e gerente. Sem bônus, vales nem holerites (isso é só do patrão).
routerAdd("GET", "/api/lr/painel/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  const v = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!v || ["patrao", "gerente"].indexOf(v.getString("papel")) < 0) throw new ForbiddenError("Só patrão e gerente veem o painel.");
  const empresa = e.app.findRecordById("empresas", empresaId);
  const agora = Date.now();
  let de = Date.parse(e.request.url.query().get("de") || "");
  let ate = Date.parse(e.request.url.query().get("ate") || "");
  if (isNaN(de)) de = lib.inicioDiaSP(agora);
  if (isNaN(ate)) ate = lib.inicioDiaSP(agora) + 86400000;
  if (ate <= de) throw new BadRequestError("Período inválido.");
  if (ate - de > 400 * 86400000) throw new BadRequestError("Período máximo: 400 dias.");
  return e.json(200, lib.painelDaEmpresa(e.app, empresa, de, ate));
}, $apis.requireAuth("usuarios"));

// ----------------------------------------------------------- minha área
// GET /api/lr/minha-area/{empresa}?mes=2026-10&funcionario=ID
// Cada pessoa da equipe vê a própria; só o patrão vê a de outra pessoa.
routerAdd("GET", "/api/lr/minha-area/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  const v = lib.vinculoEquipe(e.app, e.auth.id, empresaId);
  if (!v) throw new ForbiddenError("Só para a equipe.");
  const q = e.request.url.query();
  const alvo = q.get("funcionario") || e.auth.id;
  if (alvo !== e.auth.id) {
    if (v.getString("papel") !== "patrao") throw new ForbiddenError("Só o patrão vê a área de outra pessoa.");
    if (!lib.vinculoEquipe(e.app, alvo, empresaId)) {
      const vin = lib.acharVinculo(e.app, alvo, empresaId);
      if (!vin || vin.getString("papel") === "cliente") throw new NotFoundError("Pessoa não encontrada na equipe.");
    }
  }
  const agora = Date.now();
  const mes = lib.mesCompetencia(q.get("mes")) || [lib.inicioMesSP(agora), lib.inicioMesSeguinteSP(agora)];
  const empresa = e.app.findRecordById("empresas", empresaId);
  return e.json(200, lib.areaDoFuncionario(e.app, empresa, alvo, mes[0], mes[1]));
}, $apis.requireAuth("usuarios"));

// ------------------------------------------------------------- auditoria
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  const r = e.record;
  const depois = {};
  for (const c of ["tipo", "categoria", "valor", "data", "periodo", "valor_por_carro", "ativo", "funcionario", "competencia", "observacao"]) {
    if (r.collection().fields.getByName(c)) depois[c] = r.get(c);
  }
  lib.auditar(e.app, {
    empresa: r.getString("empresa"), usuario: lib.idUsuario(e.auth),
    acao: r.collection().name + "_criar", entidade: r.collection().name, entidade_id: r.id, depois: depois,
  });
}, "lancamentos_caixa", "metas", "regras_bonus", "vales", "holerites");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const campos = ["tipo", "categoria", "valor", "data", "descricao", "periodo", "valor_por_carro", "ativo", "cancelado", "observacao", "competencia"];
  const original = e.record.original();
  const antes = {};
  for (const c of campos) if (e.record.collection().fields.getByName(c)) antes[c] = original.get(c);
  e.next();
  const depois = {};
  for (const c of campos) if (e.record.collection().fields.getByName(c)) depois[c] = e.record.get(c);
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"), usuario: lib.idUsuario(e.auth),
    acao: e.record.collection().name + "_editar", entidade: e.record.collection().name, entidade_id: e.record.id,
    antes: antes, depois: depois,
  });
}, "lancamentos_caixa", "metas", "regras_bonus", "vales", "holerites");
