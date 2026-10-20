// Funções compartilhadas pelos hooks. Carregar com require(`${__hooks}/lib.js`)
// DENTRO de cada handler (o JSVM isola o escopo de cada handler).

const PAPEIS_EQUIPE = ["gerente", "funcionario"];

function somenteDigitos(v) {
  return String(v || "").replace(/\D/g, "");
}

// Aceita "(11) 98765-4321", "+55 11 98765-4321" etc. Devolve 10–11 dígitos.
function normalizarCelular(v) {
  let d = somenteDigitos(v);
  if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);
  return d;
}

function celularValido(d) {
  return /^[0-9]{10,11}$/.test(d);
}

function acharEmpresaAtivaPorSlug(app, slug) {
  try {
    const empresa = app.findFirstRecordByData("empresas", "slug", String(slug || "").trim().toLowerCase());
    if (!empresa.getBool("ativo")) return null;
    return empresa;
  } catch (_) {
    return null;
  }
}

function acharVinculo(app, usuarioId, empresaId) {
  try {
    return app.findFirstRecordByFilter(
      "vinculos",
      "usuario = {:u} && empresa = {:e}",
      { u: usuarioId, e: empresaId },
    );
  } catch (_) {
    return null;
  }
}

function ehPatraoAtivo(app, usuarioId, empresaId) {
  const v = acharVinculo(app, usuarioId, empresaId);
  return !!v && v.getBool("ativo") && v.getString("papel") === "patrao";
}

function resumoVinculo(v) {
  return {
    papel: v.getString("papel"),
    responsavel_fila: v.getBool("responsavel_fila"),
    ativo: v.getBool("ativo"),
  };
}

// Registra na auditoria. Nunca lança erro para não derrubar a ação principal,
// mas loga no console se falhar.
function auditar(app, dados) {
  try {
    const col = app.findCollectionByNameOrId("auditoria");
    const r = new Record(col);
    r.set("empresa", dados.empresa);
    if (dados.usuario) r.set("usuario", dados.usuario);
    r.set("acao", dados.acao);
    r.set("entidade", dados.entidade || "");
    r.set("entidade_id", dados.entidade_id || "");
    if (dados.antes !== undefined) r.set("antes", dados.antes);
    if (dados.depois !== undefined) r.set("depois", dados.depois);
    r.set("motivo", dados.motivo || "");
    app.save(r);
  } catch (err) {
    console.log("[auditoria] falha ao registrar", dados.acao, err);
  }
}

module.exports = {
  PAPEIS_EQUIPE,
  somenteDigitos,
  normalizarCelular,
  celularValido,
  acharEmpresaAtivaPorSlug,
  acharVinculo,
  ehPatraoAtivo,
  resumoVinculo,
  auditar,
};
