/// <reference path="../pb_data/types.d.ts" />
// Auditoria de 24/10/2026, S1 e S2: a equipe só lê os clientes (usuarios) e os carros (veiculos)
// com a permissão "Lista de clientes" (ou sendo o dono). Sem ela, só quem está sendo atendido agora.
//
// "Sendo atendido" fica num campo do vínculo do cliente, vinculos.atendimento_ate, que o servidor
// mantém (pb_hooks/privacidade.pb.js): entrada ativa na fila, pedido de horário esperando, orçamento
// aberto ou plano pedido/ativo = sem prazo; senão, 24 h depois da última mexida na fila; senão, vazio.
// (Primeira versão cruzava as tabelas direto na regra e ficou lenta demais: 35 s com 1.000 lavagens.)
// A equipe continua vendo a equipe. Rotas do servidor (fila pública, Clientes, Reativar, Avaliações)
// não usam estas regras.

const LOGIN = '@request.auth.id != ""';
const EU = "@collection.vinculos:eu";
const EQUIPE = `${EU}.usuario ?= @request.auth.id && ${EU}.ativo ?= true && ${EU}.papel ?!= "cliente"`;
const COM_LISTA = `${EU}.papel ?= "patrao" || ${EU}.perm_clientes ?= true`;

const USUARIOS =
  `${LOGIN} && (id = @request.auth.id || (${EQUIPE} && ` +
  `@collection.vinculos:alvo.usuario ?= id && @collection.vinculos:alvo.empresa ?= ${EU}.empresa && ` +
  `(@collection.vinculos:alvo.papel ?!= "cliente" || ${COM_LISTA} || @collection.vinculos:alvo.atendimento_ate ?> @now)))`;

const VEICULOS =
  `${LOGIN} && (cliente = @request.auth.id || (${EQUIPE} && ` +
  `@collection.vinculos:dono.usuario ?= cliente && @collection.vinculos:dono.empresa ?= ${EU}.empresa && ` +
  `(${COM_LISTA} || @collection.vinculos:dono.atendimento_ate ?> @now)))`;

// Regras de antes (para desfazer).
const USUARIOS_ANTES =
  '@request.auth.id != "" && (id = @request.auth.id || (@request.auth.id != "" && @collection.vinculos:eu.usuario ?= @request.auth.id && @collection.vinculos:eu.ativo ?= true && @collection.vinculos:eu.papel ?!= "cliente" && @collection.vinculos:alvo.usuario ?= id && @collection.vinculos:alvo.empresa ?= @collection.vinculos:eu.empresa))';
const VEICULOS_ANTES =
  '@request.auth.id != "" && (cliente = @request.auth.id || (@request.auth.id != "" && @collection.vinculos:eu.usuario ?= @request.auth.id && @collection.vinculos:eu.ativo ?= true && @collection.vinculos:eu.papel ?!= "cliente" && @collection.vinculos:dono.usuario ?= cliente && @collection.vinculos:dono.empresa ?= @collection.vinculos:eu.empresa))';
// Ninguém grava o campo pela API (nem o dono): só o servidor.
const TRAVA = " && @request.body.atendimento_ate:changed = false";

// Mesma conta de pb_hooks/lib.js (recalcularAtendimento), para os clientes que já existem.
const SEM_PRAZO = "2100-01-01 00:00:00.000Z";
function prazoAtendimento(app, clienteId, empresaId) {
  const p = { c: clienteId, e: empresaId };
  const ativos = ["pendente", "confirmado", "avisado", "no_local", "lavando", "pronto"].map((s) => `status = '${s}'`).join(" || ");
  const tem = (col, filtro) => app.findRecordsByFilter(col, `cliente = {:c} && empresa = {:e} && (${filtro})`, "", 1, 0, p).length > 0;
  if (
    tem("fila_entradas", ativos) ||
    tem("agendamentos", "status = 'pedido'") ||
    tem("orcamentos", "status = 'pedido' || status = 'respondido' || status = 'aceito'") ||
    tem("assinaturas", "status = 'pedido' || status = 'ativa'")
  ) {
    return SEM_PRAZO;
  }
  const ultima = app.findRecordsByFilter("fila_entradas", "cliente = {:c} && empresa = {:e}", "-updated", 1, 0, p)[0];
  if (!ultima) return "";
  const ate = Date.parse(ultima.getString("updated").replace(" ", "T")) + 24 * 3600000;
  return ate > Date.now() ? new Date(ate).toISOString().replace("T", " ") : "";
}

migrate((app) => {
  const vinculos = app.findCollectionByNameOrId("vinculos");
  vinculos.fields.add(new DateField({ name: "atendimento_ate" }));
  if (vinculos.updateRule && vinculos.updateRule.indexOf("atendimento_ate") < 0) vinculos.updateRule += TRAVA;
  app.save(vinculos);

  for (const v of app.findRecordsByFilter("vinculos", "papel = 'cliente'", "", 0, 0)) {
    const ate = prazoAtendimento(app, v.getString("usuario"), v.getString("empresa"));
    if (ate) {
      v.set("atendimento_ate", ate);
      app.unsafeWithoutHooks().save(v);
    }
  }

  const u = app.findCollectionByNameOrId("usuarios");
  u.listRule = USUARIOS;
  u.viewRule = USUARIOS;
  app.save(u);
  const ve = app.findCollectionByNameOrId("veiculos");
  ve.listRule = VEICULOS;
  ve.viewRule = VEICULOS;
  app.save(ve);
}, (app) => {
  const u = app.findCollectionByNameOrId("usuarios");
  u.listRule = USUARIOS_ANTES;
  u.viewRule = USUARIOS_ANTES;
  app.save(u);
  const ve = app.findCollectionByNameOrId("veiculos");
  ve.listRule = VEICULOS_ANTES;
  ve.viewRule = VEICULOS_ANTES;
  app.save(ve);
  const vinculos = app.findCollectionByNameOrId("vinculos");
  if (vinculos.updateRule) vinculos.updateRule = vinculos.updateRule.split(TRAVA).join("");
  vinculos.fields.removeByName("atendimento_ate");
  app.save(vinculos);
});
