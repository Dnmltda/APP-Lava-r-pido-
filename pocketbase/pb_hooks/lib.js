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
// Id do usuário do app que fez a ação (o admin da DNM não é usuário do app).
function idUsuario(auth) {
  try {
    return auth && auth.collection().name === "usuarios" ? auth.id : "";
  } catch (_) {
    return "";
  }
}

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

// ------------------------------------------------------------ simulação
// A fila é simulada com N vagas (carros lavados ao mesmo tempo). Cada carro, na
// ordem, ocupa a primeira vaga que liberar. Reserva nunca começa antes do horário.
const MIN = 60000;

function ordenar(v) {
  v.sort((a, b) => a - b);
  return v;
}

// itens: [{ id, dur, horario }] já na ordem da fila. Devolve { prev: {id: ms}, proxima: ms }.
function simular(vagasIniciais, itens) {
  const vagas = vagasIniciais.slice();
  const prev = {};
  for (const it of itens) {
    ordenar(vagas);
    const inicio = Math.max(vagas[0], it.horario || 0);
    prev[it.id] = inicio;
    vagas[0] = inicio + it.dur * MIN;
  }
  ordenar(vagas);
  return { prev: prev, proxima: vagas[0] };
}

function itemDaEntrada(r) {
  return {
    id: r.id,
    dur: r.getInt("duracao_min") || 30,
    horario: r.getString("origem") === "reserva" ? dataMs(r, "horario_reserva") : 0,
    reserva: r.getString("origem") === "reserva",
    ordem: r.getFloat("ordem"),
  };
}

// Estado atual da fila de uma empresa.
function carregarFila(app, empresa) {
  const agora = Date.now();
  const capacidade = Math.max(1, empresa.getInt("capacidade_simultanea") || 2);
  const ativos = Array.from(app.findRecordsByFilter(
    "fila_entradas",
    "empresa = {:e} && (" + STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")",
    "ordem", 0, 0, { e: empresa.id },
  ));
  const vagas = [];
  for (const r of ativos) {
    if (r.getString("status") !== "lavando") continue;
    const inicio = dataMs(r, "inicio_em") || agora;
    vagas.push(Math.max(agora, inicio + (r.getInt("duracao_min") || 30) * MIN));
  }
  while (vagas.length < capacidade) vagas.push(agora);
  ordenar(vagas);
  // Mais carros lavando que a capacidade: só as N vagas que liberam primeiro contam.
  vagas.splice(capacidade);
  const espera = ativos.filter((r) => STATUS_ESPERA.indexOf(r.getString("status")) >= 0);
  return { agora: agora, capacidade: capacidade, ativos: ativos, espera: espera, vagas: vagas };
}

function maiorOrdem(app, empresaId) {
  const ultima = app.findRecordsByFilter("fila_entradas", "empresa = {:e}", "-ordem", 1, 0, { e: empresaId });
  return ultima.length ? ultima[0].getFloat("ordem") : 0;
}

// Ordem entre duas posições da lista de espera (antes do índice p).
function ordemAntesDe(app, empresaId, lista, p) {
  if (p >= lista.length) return Math.floor(maiorOrdem(app, empresaId)) + 1;
  const depois = lista[p].ordem;
  const antes = p > 0 ? lista[p - 1].ordem : depois - 1;
  return (antes + depois) / 2;
}

// Onde entra um cliente novo: no fim da fila. A única exceção são reservas no fim
// da fila marcadas para mais tarde: o cliente novo passa na frente delas SÓ se
// isso não atrasar nenhuma reserva (ninguém fura a fila de verdade).
function posicaoNovaEntrada(estado, dur) {
  const lista = estado.espera.map(itemDaEntrada);
  let inicioBloco = lista.length;
  while (inicioBloco > 0 && lista[inicioBloco - 1].reserva) inicioBloco--;
  const novo = { id: "__novo__", dur: dur, horario: 0 };
  for (let p = inicioBloco; p <= lista.length; p++) {
    const tentativa = lista.slice(0, p).concat([novo], lista.slice(p));
    const sim = simular(estado.vagas, tentativa);
    let ok = true;
    for (const it of lista.slice(p)) {
      if (it.reserva && sim.prev[it.id] > it.horario + MIN) ok = false;
    }
    if (ok) return { p: p, lista: lista, previsao: sim.prev["__novo__"] };
  }
  const sim = simular(estado.vagas, lista.concat([novo]));
  return { p: lista.length, lista: lista, previsao: sim.prev["__novo__"] };
}

// Onde entra uma reserva: antes do primeiro carro cuja previsão já passa do horário.
function posicaoReserva(estado, horario, dur) {
  const lista = estado.espera.map(itemDaEntrada);
  const sim = simular(estado.vagas, lista);
  let p = lista.findIndex((it) => sim.prev[it.id] >= horario);
  if (p < 0) p = lista.length;
  const nova = { id: "__reserva__", dur: dur, horario: horario };
  const sim2 = simular(estado.vagas, lista.slice(0, p).concat([nova], lista.slice(p)));
  return { p: p, lista: lista, previsao: sim2.prev["__reserva__"] };
}

// Reposicionar um cliente atrasado: ele continua na fila, na primeira posição em
// que a previsão dele fica igual ou depois da nova hora de chegada.
// Nunca vai para a frente de onde estava.
function posicaoReposicionar(estado, entradaId, chegada) {
  const atual = estado.espera.findIndex((r) => r.id === entradaId);
  const lista = estado.espera.filter((r) => r.id !== entradaId).map(itemDaEntrada);
  const eu = itemDaEntrada(estado.espera[atual]);
  for (let p = atual; p <= lista.length; p++) {
    const sim = simular(estado.vagas, lista.slice(0, p).concat([eu], lista.slice(p)));
    if (sim.prev[eu.id] >= chegada - MIN || p === lista.length) {
      return { p: p, lista: lista, previsao: sim.prev[eu.id] };
    }
  }
}

// Hora em que o cliente deveria chegar: aviso + antecedência, horário da reserva
// ou a previsão gravada na confirmação.
function horaEsperada(r, empresa) {
  const avisado = dataMs(r, "avisado_em");
  if (avisado) return avisado + (empresa.getInt("aviso_min") || 0) * MIN;
  if (r.getString("chegada_prevista")) return dataMs(r, "chegada_prevista");
  if (r.getString("origem") === "reserva") return dataMs(r, "horario_reserva");
  return dataMs(r, "previsao_inicio");
}

// Minutos de atraso além da tolerância (0 = não está atrasado).
function minutosAtraso(r, empresa, agora) {
  const st = r.getString("status");
  if (st !== "confirmado" && st !== "avisado") return 0;
  const esperada = horaEsperada(r, empresa);
  if (!esperada) return 0;
  const tol = (empresa.getInt("tolerancia_min") || 0) * MIN;
  const atraso = agora - esperada - tol;
  return atraso > 0 ? Math.ceil(atraso / MIN) : 0;
}

function calcularPrevisoes(app, empresa) {
  const estado = carregarFila(app, empresa);
  const sim = simular(estado.vagas, estado.espera.map(itemDaEntrada));
  const nova = posicaoNovaEntrada(estado, 30);
  return {
    ativos: estado.ativos,
    previsoes: sim.prev,
    proximaVaga: nova.previsao,
    agora: estado.agora,
    estado: estado,
  };
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

// Dados de cliente de balcão/reserva. Se o celular for de um cliente cadastrado
// nesta empresa (e sem outra entrada ativa), a entrada fica ligada à conta dele.
function preencherDadosAvulsos(app, entrada, empresaId, d) {
  const nome = String(d.nome || "").trim().slice(0, 120);
  if (nome) entrada.set("nome_avulso", nome);
  entrada.set("celular_avulso", d.celular || "");
  if (d.final_placa) entrada.set("final_placa_avulsa", d.final_placa);
  const veic = String(d.veiculo_desc || "").trim().slice(0, 90);
  if (veic) entrada.set("veiculo_avulso", veic);
  const obs = String(d.observacao || "").trim().slice(0, 300);
  if (obs) entrada.set("observacao", obs);
  if (d.celular && !entrada.getString("cliente")) {
    try {
      const u = app.findFirstRecordByData("usuarios", "celular", d.celular);
      const v = acharVinculo(app, u.id, empresaId);
      const ativas = app.findRecordsByFilter(
        "fila_entradas",
        "empresa = {:e} && cliente = {:c} && (" + STATUS_ATIVOS.map((s) => "status = '" + s + "'").join(" || ") + ")",
        "", 1, 0, { e: empresaId, c: u.id },
      );
      if (v && v.getBool("ativo") && v.getString("papel") === "cliente" && ativas.length === 0) {
        entrada.set("cliente", u.id);
      }
    } catch (_) {}
  }
}

function resumoEntrada(r) {
  return { status: r.getString("status"), ordem: r.getFloat("ordem") };
}

// ---------------------------------------------------------------- vendas
const FORMAS_PAGAMENTO = ["cartao", "dinheiro", "pix"];

// Valida a lista [{produto, quantidade}] contra os produtos ativos da empresa.
// Junta linhas repetidas do mesmo produto.
function validarItens(app, empresaId, itens, maxQtd) {
  const lista = Array.isArray(itens) ? itens : [];
  if (lista.length > 30) throw new BadRequestError("Itens demais.");
  const porProduto = {};
  for (const it of lista) {
    const id = String((it && it.produto) || "");
    const qtd = parseInt(it && it.quantidade, 10);
    if (!id || !qtd || qtd < 1 || qtd > maxQtd) throw new BadRequestError("Quantidade inválida.");
    porProduto[id] = (porProduto[id] || 0) + qtd;
  }
  const saida = [];
  for (const id of Object.keys(porProduto)) {
    let p;
    try {
      p = app.findRecordById("produtos", id);
    } catch (_) {}
    if (!p || p.getString("empresa") !== empresaId) throw new BadRequestError("Produto não encontrado.");
    if (!p.getBool("ativo")) throw new BadRequestError("O produto " + p.getString("nome") + " não está disponível.");
    if (porProduto[id] > maxQtd) throw new BadRequestError("Quantidade inválida.");
    saida.push({ produto: p, quantidade: porProduto[id] });
  }
  return saida;
}

function arred(v) {
  return Math.round(v * 100) / 100;
}

function comissaoDoItem(produto, quantidade, preco, comissaoAtiva) {
  if (!comissaoAtiva) return 0;
  const tipo = produto.getString("comissao_tipo");
  const valor = produto.getFloat("comissao_valor");
  if (tipo === "fixo") return arred(valor * quantidade);
  if (tipo === "percentual") return arred((preco * quantidade * valor) / 100);
  return 0;
}

// Troca os itens da venda pelos novos e devolve { total, comissao }.
function gravarItensVenda(app, venda, itens, comissaoAtiva) {
  const antigos = app.findRecordsByFilter("vendas_itens", "venda = {:v}", "", 0, 0, { v: venda.id });
  for (const a of antigos) app.delete(a);
  const col = app.findCollectionByNameOrId("vendas_itens");
  let total = 0;
  let comissao = 0;
  for (const it of itens) {
    const preco = it.produto.getFloat("preco");
    const c = comissaoDoItem(it.produto, it.quantidade, preco, comissaoAtiva);
    const r = new Record(col);
    r.set("empresa", venda.getString("empresa"));
    r.set("venda", venda.id);
    r.set("produto", it.produto.id);
    r.set("produto_nome", it.produto.getString("nome"));
    r.set("quantidade", it.quantidade);
    r.set("preco_unitario", preco);
    r.set("comissao_calculada", c);
    app.save(r);
    total += preco * it.quantidade;
    comissao += c;
  }
  return { total: arred(total), comissao: arred(comissao) };
}

// Baixa (sinal -1) ou devolve (sinal +1) o estoque dos itens já gravados da venda.
function moverEstoqueDaVenda(app, vendaId, sinal) {
  const itens = app.findRecordsByFilter("vendas_itens", "venda = {:v}", "", 0, 0, { v: vendaId });
  for (const it of itens) {
    const p = app.findRecordById("produtos", it.getString("produto"));
    p.set("estoque", p.getInt("estoque") + sinal * it.getInt("quantidade"));
    app.saveNoValidate(p);
  }
}

// Fecha a venda: bloqueia, baixa o estoque e registra na auditoria.
function fecharVenda(tx, venda, empresa, authId) {
  if (!venda.getString("forma_pagamento")) throw new BadRequestError("Escolha a forma de pagamento.");
  const itens = tx.findRecordsByFilter("vendas_itens", "venda = {:v}", "", 0, 0, { v: venda.id });
  if (!itens.length) throw new BadRequestError("Adicione pelo menos um produto.");
  moverEstoqueDaVenda(tx, venda.id, -1);
  venda.set("status", "fechada");
  venda.set("fechada_em", agoraISO());
  tx.save(venda);
  auditar(tx, {
    empresa: empresa.id, usuario: authId, acao: "venda_fechar",
    entidade: "vendas", entidade_id: venda.id, depois: resumoVenda(tx, venda),
  });
}

function resumoVenda(app, venda) {
  const itens = app.findRecordsByFilter("vendas_itens", "venda = {:v}", "", 0, 0, { v: venda.id });
  return {
    status: venda.getString("status"),
    forma_pagamento: venda.getString("forma_pagamento"),
    total: venda.getFloat("total"),
    comissao_total: venda.getFloat("comissao_total"),
    itens: Array.from(itens).map((i) => ({ produto: i.getString("produto_nome"), quantidade: i.getInt("quantidade"), preco: i.getFloat("preco_unitario") })),
  };
}

module.exports = {
  FORMAS_PAGAMENTO,
  validarItens,
  gravarItensVenda,
  moverEstoqueDaVenda,
  resumoVenda,
  fecharVenda,
  STATUS_ESPERA,
  STATUS_ATIVOS,
  vinculoEquipe,
  podeGerirFila,
  dataMs,
  agoraISO,
  calcularPrevisoes,
  carregarFila,
  simular,
  posicaoNovaEntrada,
  posicaoReserva,
  posicaoReposicionar,
  ordemAntesDe,
  minutosAtraso,
  sinalizarFila,
  resumoEntrada,
  preencherDadosAvulsos,
  prepararVeiculo,
  PAPEIS_EQUIPE,
  somenteDigitos,
  normalizarCelular,
  celularValido,
  acharEmpresaAtivaPorSlug,
  acharVinculo,
  ehPatraoAtivo,
  resumoVinculo,
  idUsuario,
  auditar,
};
