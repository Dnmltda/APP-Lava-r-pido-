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

// ------------------------------------------------------------------ fila
const STATUS_ESPERA = ["pendente", "confirmado", "avisado", "no_local"];
const STATUS_ATIVOS = STATUS_ESPERA.concat(["lavando", "pronto"]);
const PAPEIS_GESTAO_FILA = ["patrao", "gerente"];

// Vínculo ativo de equipe (não cliente) ou null.
function vinculoEquipe(app, usuarioId, empresaId) {
  const v = acharVinculo(app, usuarioId, empresaId);
  if (!v || !v.getBool("ativo") || v.getString("papel") === "cliente") return null;
  return v;
}

// Patrão, gerente ou funcionário com "responsável pela fila".
function podeGerirFila(v) {
  if (!v || !v.getBool("ativo")) return false;
  const p = v.getString("papel");
  return PAPEIS_GESTAO_FILA.indexOf(p) >= 0 || (p === "funcionario" && v.getBool("responsavel_fila"));
}

function dataMs(record, campo) {
  const s = record.getString(campo);
  if (!s) return 0;
  const t = Date.parse(s.replace(" ", "T"));
  return isNaN(t) ? 0 : t;
}

function agoraISO() {
  return new Date().toISOString().replace("T", " ");
}

// Previsão de início de cada carro esperando, com N carros lavando ao mesmo tempo.
// Mantém a ordem de entrada (ninguém fura a fila): cada carro, na ordem, ocupa a
// primeira vaga que liberar.
function calcularPrevisoes(app, empresa) {
  const agora = Date.now();
  const capacidade = Math.max(1, empresa.getInt("capacidade_simultanea") || 2);
  const ativos = app.findRecordsByFilter(
    "fila_entradas",
    "empresa = {:e} && (" + STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")",
    "ordem", 0, 0, { e: empresa.id },
  );
  const vagas = [];
  for (const r of ativos) {
    if (r.getString("status") !== "lavando") continue;
    const inicio = dataMs(r, "inicio_em") || agora;
    vagas.push(Math.max(agora, inicio + (r.getInt("duracao_min") || 30) * 60000));
  }
  while (vagas.length < capacidade) vagas.push(agora);
  vagas.sort((a, b) => a - b);
  // Se há mais carros lavando que a capacidade, só as N vagas que liberam primeiro contam.
  vagas.splice(capacidade);

  const previsoes = {};
  for (const r of ativos) {
    if (STATUS_ESPERA.indexOf(r.getString("status")) < 0) continue;
    vagas.sort((a, b) => a - b);
    const inicio = vagas[0];
    previsoes[r.id] = inicio;
    vagas[0] = inicio + (r.getInt("duracao_min") || 30) * 60000;
  }
  vagas.sort((a, b) => a - b);
  return { ativos: ativos, previsoes: previsoes, proximaVaga: vagas[0], agora: agora };
}

// Avisa todos os celulares que a fila da empresa mudou (tempo real).
function sinalizarFila(app, empresaId) {
  try {
    let s;
    try {
      s = app.findFirstRecordByData("fila_sinais", "empresa", empresaId);
    } catch (_) {
      s = new Record(app.findCollectionByNameOrId("fila_sinais"));
      s.set("empresa", empresaId);
      s.set("versao", 0);
    }
    s.set("versao", s.getInt("versao") + 1);
    app.save(s);
  } catch (err) {
    console.log("[fila] falha ao sinalizar", empresaId, err);
  }
}

function prepararVeiculo(r) {
  const placa = String(r.getString("placa") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  r.set("placa", placa);
  if (placa.length === 7) r.set("final_placa", placa.slice(-3));
  else r.set("final_placa", String(r.getString("final_placa") || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
  r.set("modelo", String(r.getString("modelo") || "").trim());
  r.set("cor", String(r.getString("cor") || "").trim());
}

function resumoEntrada(r) {
  return { status: r.getString("status"), ordem: r.getInt("ordem") };
}

module.exports = {
  STATUS_ESPERA,
  STATUS_ATIVOS,
  vinculoEquipe,
  podeGerirFila,
  dataMs,
  agoraISO,
  calcularPrevisoes,
  sinalizarFila,
  resumoEntrada,
  prepararVeiculo,
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
