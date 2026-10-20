/// <reference path="../pb_data/types.d.ts" />
// Acessos extras que o DONO libera por pessoa (sem mexer no app):
//   perm_clientes  → lista de clientes (padrão: só o dono)
//   perm_valores   → dashboard, painel do dia, caixa e vendas de todos (padrão: dono e gerente)
//   perm_cameras   → ver as câmeras (padrão: só o dono; configurar continua só do dono)
//   perm_catalogo  → editar serviços, preços e produtos (padrão: só o dono)
// Equipe e senhas, vales, holerites, configurações e auditoria continuam só do dono.
const V = "@collection.vinculos:eu";
const PATRAO_GERENTE = `(${V}.papel ?= "patrao" || ${V}.papel ?= "gerente")`;
const COM_VALORES = `(${V}.papel ?= "patrao" || ${V}.papel ?= "gerente" || (${V}.papel ?= "funcionario" && ${V}.perm_valores ?= true))`;
const SO_PATRAO = `(${V}.papel ?= "patrao")`;
const COM_CATALOGO = `(${V}.papel ?= "patrao" || ((${V}.papel ?= "gerente" || ${V}.papel ?= "funcionario") && ${V}.perm_catalogo ?= true))`;
const PATRAO_CAM = `${V}.papel ?= "patrao"`;
const COM_CAMERAS = `(${V}.papel ?= "patrao" || ((${V}.papel ?= "gerente" || ${V}.papel ?= "funcionario") && ${V}.perm_cameras ?= true))`;

const TROCAS = [
  // [coleção, regras, de, para]
  ["vendas", ["listRule", "viewRule"], PATRAO_GERENTE, COM_VALORES],
  ["vendas_itens", ["listRule", "viewRule"], PATRAO_GERENTE, COM_VALORES],
  ["lancamentos_caixa", ["listRule", "viewRule"], PATRAO_GERENTE, COM_VALORES],
  ["metas", ["listRule", "viewRule"], PATRAO_GERENTE, COM_VALORES],
  ["servicos", ["createRule", "updateRule"], SO_PATRAO, COM_CATALOGO],
  ["produtos", ["createRule", "updateRule"], SO_PATRAO, COM_CATALOGO],
  ["cameras", ["listRule", "viewRule"], PATRAO_CAM, COM_CAMERAS],
  ["camera_eventos", ["listRule", "viewRule"], PATRAO_CAM, COM_CAMERAS],
];

function trocar(app, de, para) {
  for (const [nome, regras, a, b] of TROCAS) {
    const c = app.findCollectionByNameOrId(nome);
    for (const r of regras) {
      const atual = c[r] || "";
      const origem = de ? a : b;
      const destino = de ? b : a;
      if (atual.indexOf(origem) < 0) throw new Error(`Regra inesperada em ${nome}.${r}: ${atual}`);
      c[r] = atual.split(origem).join(destino);
    }
    app.save(c);
  }
}

migrate((app) => {
  const vinculos = app.findCollectionByNameOrId("vinculos");
  for (const n of ["perm_clientes", "perm_valores", "perm_cameras", "perm_catalogo"]) {
    vinculos.fields.add(new BoolField({ name: n }));
  }
  app.save(vinculos);
  trocar(app, true);
}, (app) => {
  trocar(app, false);
  const vinculos = app.findCollectionByNameOrId("vinculos");
  for (const n of ["perm_clientes", "perm_valores", "perm_cameras", "perm_catalogo"]) vinculos.fields.removeByName(n);
  app.save(vinculos);
});
