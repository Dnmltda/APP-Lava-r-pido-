/// <reference path="../pb_data/types.d.ts" />
// ETAPA 8 — Correção de segurança encontrada na auditoria.
//
// Regras do tipo `cliente = @request.auth.id` também valiam para visitante SEM login:
// o id vazio "batia" com entradas sem cliente (balcão e reserva). Assim, qualquer pessoa
// conseguia listar nome, celular e placa dessas entradas e os produtos delas.
//
// Correção: toda regra passa a exigir login, menos as leituras públicas de propósito:
//   empresas (página do lava rápido), servicos (lista de serviços) e fila_sinais (versão da fila).
const PUBLICAS = { empresas: ["listRule", "viewRule"], servicos: ["listRule", "viewRule"], fila_sinais: ["listRule", "viewRule"] };
const REGRAS = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];
const LOGIN = '@request.auth.id != ""';

migrate((app) => {
  for (const c of app.findAllCollections()) {
    if (c.system) continue;
    let mudou = false;
    for (const r of REGRAS) {
      const regra = c[r];
      if (regra === null || regra === undefined) continue;
      if ((PUBLICAS[c.name] || []).indexOf(r) >= 0) continue;
      if (regra.indexOf(LOGIN + " && (") === 0) continue;
      c[r] = regra === "" ? LOGIN : LOGIN + " && (" + regra + ")";
      mudou = true;
    }
    if (mudou) app.save(c);
  }
}, (app) => {
  for (const c of app.findAllCollections()) {
    if (c.system) continue;
    let mudou = false;
    for (const r of REGRAS) {
      const regra = c[r];
      if (regra && regra.indexOf(LOGIN + " && (") === 0) {
        c[r] = regra.slice((LOGIN + " && (").length, -1);
        mudou = true;
      }
    }
    if (mudou) app.save(c);
  }
});
