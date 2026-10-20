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

// ---------------------------------------------------------------- painéis
// Brasil sem horário de verão: São Paulo = UTC−3.
const OFFSET_SP = 3 * 3600000;
const DIA = 86400000;

function inicioDiaSP(ms) {
  return Math.floor((ms - OFFSET_SP) / DIA) * DIA + OFFSET_SP;
}
function inicioSemanaSP(ms) {
  const dia = inicioDiaSP(ms);
  const dow = new Date(dia).getUTCDay(); // 0 = domingo
  return dia - ((dow + 6) % 7) * DIA; // segunda-feira
}
function inicioMesSP(ms) {
  const d = new Date(ms - OFFSET_SP);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + OFFSET_SP;
}
function inicioMesSeguinteSP(ms) {
  const d = new Date(ms - OFFSET_SP);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) + OFFSET_SP;
}
function dataPB(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}
// "2026-10" → [início, fim) do mês em São Paulo
function mesCompetencia(comp) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(comp || ""));
  if (!m) return null;
  const ini = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1) + OFFSET_SP;
  return [ini, inicioMesSeguinteSP(ini)];
}

function buscar(app, col, filtro, params) {
  return Array.from(app.findRecordsByFilter(col, filtro, "", 0, 0, params));
}

function somar(lista, fn) {
  let s = 0;
  for (const x of lista) s += fn(x);
  return arred(s);
}

// Faturamento (serviços finalizados + vendas fechadas) num intervalo.
function faturamento(app, empresaId, de, ate) {
  const p = { e: empresaId, de: dataPB(de), ate: dataPB(ate) };
  const carros = buscar(app, "fila_entradas", "empresa = {:e} && status = 'finalizado' && finalizado_em >= {:de} && finalizado_em < {:ate}", p);
  const vendas = buscar(app, "vendas", "empresa = {:e} && (status = 'fechada' || status = 'corrigida') && fechada_em >= {:de} && fechada_em < {:ate}", p);
  const servicos = somar(carros, (r) => r.getFloat("preco_servico"));
  const produtos = somar(vendas, (r) => r.getFloat("total"));
  return { carros: carros, vendas: vendas, servicos: servicos, produtos: produtos, total: arred(servicos + produtos) };
}

function nomesDeUsuarios(app, ids) {
  const nomes = {};
  for (const id of ids) {
    if (!id || nomes[id] !== undefined) continue;
    try {
      nomes[id] = app.findRecordById("usuarios", id).getString("nome");
    } catch (_) {
      nomes[id] = "";
    }
  }
  return nomes;
}

function painelDaEmpresa(app, empresa, de, ate) {
  const agora = Date.now();
  const f = faturamento(app, empresa.id, de, ate);
  const p = { e: empresa.id, de: dataPB(de), ate: dataPB(ate) };

  // Caixa
  const lanc = buscar(app, "lancamentos_caixa", "empresa = {:e} && cancelado = false && data >= {:de} && data < {:ate}", p);
  const entradas = somar(lanc.filter((l) => l.getString("tipo") === "entrada"), (l) => l.getFloat("valor"));
  const saidas = somar(lanc.filter((l) => l.getString("tipo") === "saida"), (l) => l.getFloat("valor"));
  const gastosPorCategoria = {};
  for (const l of lanc) {
    if (l.getString("tipo") !== "saida") continue;
    const c = l.getString("categoria") || "Outros";
    gastosPorCategoria[c] = arred((gastosPorCategoria[c] || 0) + l.getFloat("valor"));
  }

  // Formas de pagamento (vendas de produtos)
  const porForma = { cartao: 0, dinheiro: 0, pix: 0 };
  for (const v of f.vendas) porForma[v.getString("forma_pagamento")] = arred((porForma[v.getString("forma_pagamento")] || 0) + v.getFloat("total"));

  // Ranking por funcionário: vendas e carros lavados
  const rank = {};
  const linha = (id) => (rank[id] = rank[id] || { usuario: id, vendas_total: 0, vendas_qtd: 0, carros: 0 });
  for (const v of f.vendas) {
    const r = linha(v.getString("funcionario"));
    r.vendas_total = arred(r.vendas_total + v.getFloat("total"));
    r.vendas_qtd++;
  }
  for (const c of f.carros) if (c.getString("lavado_por")) linha(c.getString("lavado_por")).carros++;
  const nomes = nomesDeUsuarios(app, Object.keys(rank));
  const rankingFuncionarios = Object.values(rank)
    .map((r) => Object.assign(r, { nome: nomes[r.usuario] || "—" }))
    .sort((a, b) => b.vendas_total - a.vendas_total || b.carros - a.carros);

  // Ranking por produto
  const porProduto = {};
  for (const v of f.vendas) {
    for (const it of buscar(app, "vendas_itens", "venda = {:v}", { v: v.id })) {
      const nome = it.getString("produto_nome");
      const r = (porProduto[nome] = porProduto[nome] || { nome: nome, quantidade: 0, total: 0 });
      r.quantidade += it.getInt("quantidade");
      r.total = arred(r.total + it.getInt("quantidade") * it.getFloat("preco_unitario"));
    }
  }
  const rankingProdutos = Object.values(porProduto).sort((a, b) => b.total - a.total);

  // Estoque baixo
  const estoqueBaixo = buscar(app, "produtos", "empresa = {:e} && ativo = true && estoque <= estoque_minimo", { e: empresa.id })
    .map((r) => ({ id: r.id, nome: r.getString("nome"), estoque: r.getInt("estoque"), minimo: r.getInt("estoque_minimo") }));

  // Fila agora
  const estado = carregarFila(app, empresa);
  const filaAgora = {
    esperando: estado.espera.length,
    pendentes: estado.espera.filter((r) => r.getString("status") === "pendente").length,
    lavando: estado.ativos.filter((r) => r.getString("status") === "lavando").length,
    prontos: estado.ativos.filter((r) => r.getString("status") === "pronto").length,
    clientes_atrasados: estado.espera.filter((r) => minutosAtraso(r, empresa, agora) > 0).length,
  };

  // Atrasos da fila (equipe começou depois da previsão confirmada)
  const tol = empresa.getInt("tolerancia_min") || 10;
  const comecados = buscar(app, "fila_entradas", "empresa = {:e} && inicio_em >= {:de} && inicio_em < {:ate} && previsao_inicio != ''", p);
  const atrasos = [];
  for (const r of comecados) {
    const min = Math.round((dataMs(r, "inicio_em") - dataMs(r, "previsao_inicio")) / MIN);
    if (min >= tol) {
      atrasos.push({ id: r.id, minutos: min, previsto: r.getString("previsao_inicio"), inicio: r.getString("inicio_em"), reserva: r.getString("origem") === "reserva" });
    }
  }
  atrasos.sort((a, b) => b.minutos - a.minutos);

  // Metas (sempre hoje e mês atual)
  const metas = {};
  for (const m of buscar(app, "metas", "empresa = {:e}", { e: empresa.id })) metas[m.getString("periodo")] = m.getFloat("valor");
  const hoje = faturamento(app, empresa.id, inicioDiaSP(agora), inicioDiaSP(agora) + DIA);
  const mes = faturamento(app, empresa.id, inicioMesSP(agora), inicioMesSeguinteSP(agora));

  return {
    periodo: { de: new Date(de).toISOString(), ate: new Date(ate).toISOString() },
    carros_lavados: f.carros.length,
    faturamento: { servicos: f.servicos, produtos: f.produtos, total: f.total },
    caixa: { entradas: entradas, saidas: saidas, gastos_por_categoria: gastosPorCategoria },
    saldo: arred(f.total + entradas - saidas),
    por_forma_pagamento: porForma,
    ranking_funcionarios: rankingFuncionarios,
    ranking_produtos: rankingProdutos,
    estoque_baixo: estoqueBaixo,
    fila_agora: filaAgora,
    atrasos: { total: atrasos.length, media_min: atrasos.length ? Math.round(atrasos.reduce((s, a) => s + a.minutos, 0) / atrasos.length) : 0, lista: atrasos.slice(0, 20) },
    metas: {
      dia: metas.dia || 0, mes: metas.mes || 0,
      realizado_dia: hoje.total, realizado_mes: mes.total,
    },
  };
}

// Área de uma pessoa da equipe num mês: carros, vendas, comissão, bônus estimado e vales.
function areaDoFuncionario(app, empresa, usuarioId, mesIni, mesFim) {
  const agora = Date.now();
  const contar = (de, ate) =>
    buscar(app, "fila_entradas", "empresa = {:e} && lavado_por = {:u} && status = 'finalizado' && finalizado_em >= {:de} && finalizado_em < {:ate}",
      { e: empresa.id, u: usuarioId, de: dataPB(de), ate: dataPB(ate) }).length;
  const vendas = buscar(app, "vendas", "empresa = {:e} && funcionario = {:u} && (status = 'fechada' || status = 'corrigida') && fechada_em >= {:de} && fechada_em < {:ate}",
    { e: empresa.id, u: usuarioId, de: dataPB(mesIni), ate: dataPB(mesFim) });
  const carrosMes = contar(mesIni, mesFim);
  let regra = null;
  try {
    regra = app.findFirstRecordByData("regras_bonus", "empresa", empresa.id);
  } catch (_) {}
  const porCarro = regra && regra.getBool("ativo") ? regra.getFloat("valor_por_carro") : 0;
  const comissao = somar(vendas, (v) => v.getFloat("comissao_total"));
  const vales = buscar(app, "vales", "empresa = {:e} && funcionario = {:u} && cancelado = false && data >= {:de} && data < {:ate}",
    { e: empresa.id, u: usuarioId, de: dataPB(mesIni), ate: dataPB(mesFim) });
  const bonusCarros = arred(carrosMes * porCarro);
  const totalVales = somar(vales, (v) => v.getFloat("valor"));
  return {
    usuario: usuarioId,
    mes: { de: new Date(mesIni).toISOString(), ate: new Date(mesFim).toISOString() },
    carros: {
      hoje: contar(inicioDiaSP(agora), inicioDiaSP(agora) + DIA),
      semana: contar(inicioSemanaSP(agora), inicioDiaSP(agora) + DIA),
      mes: carrosMes,
    },
    vendas: { quantidade: vendas.length, total: somar(vendas, (v) => v.getFloat("total")), comissao: comissao },
    bonus: { valor_por_carro: porCarro, por_carros: bonusCarros, comissao: comissao, estimado: arred(bonusCarros + comissao) },
    vales: { quantidade: vales.length, total: totalVales },
    saldo_estimado: arred(bonusCarros + comissao - totalVales),
  };
}

// ------------------------------------------------------------------ avisos
const TEXTOS_PADRAO = {
  confirmada: "Sua vez no {empresa} foi confirmada! Previsão de início: {hora}.",
  aviso_vez: "Faltam {minutos} minutos para a sua vez no {empresa}. Se quiser, já pode vir, temos café esperando!",
  pronto: "Seu carro está pronto no {empresa}. Pode vir buscar!",
  avaliacao: "Como foi sua lavagem no {empresa}? Toque para avaliar.",
};

const FMT_HORA_SP = (ms) => {
  const d = new Date(ms - OFFSET_SP);
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
};

function textoDoAviso(empresa, chave, vars) {
  let textos = {};
  try {
    textos = JSON.parse(empresa.getString("textos_aviso") || "{}") || {};
  } catch (_) {}
  let t = String(textos[chave] || TEXTOS_PADRAO[chave] || "");
  const valores = Object.assign({ empresa: empresa.getString("nome"), minutos: String(empresa.getInt("aviso_min") || 15) }, vars || {});
  for (const k of Object.keys(valores)) t = t.split("{" + k + "}").join(valores[k]);
  return t;
}

// Par de chaves VAPID do servidor (gera na primeira vez).
function chavesPush(app) {
  try {
    const r = app.findFirstRecordByFilter("push_chaves", "id != ''");
    return { publica: r.getString("publica"), privada: r.getString("privada") };
  } catch (_) {}
  const nova = $lr.gerarChavesVapid();
  if (nova.erro) throw new Error(nova.erro);
  const r = new Record(app.findCollectionByNameOrId("push_chaves"));
  r.set("publica", nova.publica);
  r.set("privada", nova.privada);
  app.save(r);
  return { publica: nova.publica, privada: nova.privada };
}

// Manda a notificação para todos os aparelhos do usuário. Nunca lança erro.
// Inscrições expiradas (404/410) são apagadas.
function notificarUsuario(app, usuarioId, msg) {
  let enviados = 0;
  try {
    const inscricoes = app.findRecordsByFilter("push_inscricoes", "usuario = {:u}", "", 20, 0, { u: usuarioId });
    if (!inscricoes.length) return 0;
    const ch = chavesPush(app);
    const payload = JSON.stringify({ title: msg.titulo, body: msg.texto, url: msg.url || "/", tag: msg.tag || "" });
    for (const i of inscricoes) {
      const sub = JSON.stringify({ endpoint: i.getString("endpoint"), keys: { p256dh: i.getString("p256dh"), auth: i.getString("auth") } });
      const r = $lr.enviarPush(sub, payload, ch.publica, ch.privada, "mailto:contato@dnmltda.com.br", 3600);
      if (r.status >= 200 && r.status < 300) enviados++;
      else if (r.status === 404 || r.status === 410) app.delete(i);
      else console.log("[push] falhou", r.status, r.erro);
    }
  } catch (err) {
    console.log("[push] erro", err);
  }
  return enviados;
}

// Aviso de uma entrada da fila para o cliente dela (só uma vez por tipo).
//   tipo: confirmada | aviso_vez | pronto | avaliacao
function notificarEntrada(app, entrada, tipo, extra) {
  const cliente = entrada.getString("cliente");
  if (!cliente) return 0;
  const campo = { confirmada: "push_confirmado_em", aviso_vez: "push_aviso_em", pronto: "push_pronto_em", avaliacao: "push_avaliacao_em" }[tipo];
  if (!campo) return 0;
  if (entrada.getString(campo) && !(extra && extra.repetir)) return 0;
  let empresa;
  try {
    empresa = app.findRecordById("empresas", entrada.getString("empresa"));
  } catch (_) {
    return 0;
  }
  const slug = empresa.getString("slug");
  const prev = dataMs(entrada, "previsao_inicio");
  const titulos = { confirmada: "Vez confirmada ✅", aviso_vez: "Já pode vir! 🚗", pronto: "Carro pronto ✨", avaliacao: "Como foi sua lavagem?" };
  const enviados = notificarUsuario(app, cliente, {
    titulo: titulos[tipo] + " · " + empresa.getString("nome"),
    texto: textoDoAviso(empresa, tipo, { hora: prev ? FMT_HORA_SP(prev) : "" }),
    url: tipo === "avaliacao" ? "/" + slug + "/avaliar/" + entrada.id : "/" + slug,
    tag: tipo + "-" + entrada.id,
  });
  try {
    entrada.set(campo, agoraISO());
    app.unsafeWithoutHooks().save(entrada);
  } catch (err) {
    console.log("[push] não marcou", campo, err);
  }
  return enviados;
}

// ------------------------------------------------------------- câmeras
const TIPOS_CAMERA = ["app_fabricante", "imagem", "hls", "demonstracao"];
const PASSE_CAMERA_S = 600;

// Segredo do servidor guardado no banco (gera na primeira vez).
function segredoServidor(app, nome) {
  try {
    return app.findFirstRecordByData("servidor_segredos", "nome", nome).getString("valor");
  } catch (_) {}
  const r = new Record(app.findCollectionByNameOrId("servidor_segredos"));
  r.set("nome", nome);
  r.set("valor", $security.randomString(64));
  app.save(r);
  return r.getString("valor");
}

// Em produção o gateway precisa ser HTTPS e público (túnel). Endereços internos
// (localhost, 10.x, 192.168.x…) só com LR_CAMERAS_LOCAL=1 (testes e desenvolvimento).
function enderecoGatewayPermitido(url) {
  const m = /^(https?):\/\/(\[[^\]]+\]|[^\/:?#@]+)(:\d+)?(\/[^?#]*)?$/i.exec(String(url || ""));
  if (!m) return "Endereço do gateway inválido. Use algo como https://cameras.seudominio.com.br";
  if ($os.getenv("LR_CAMERAS_LOCAL") === "1") return "";
  if (m[1].toLowerCase() !== "https") return "Use um endereço https:// para o gateway (ex.: túnel da Cloudflare).";
  const host = m[2].toLowerCase().replace(/^\[|\]$/g, "");
  const interno =
    host === "localhost" || /\.localhost$/.test(host) || /\.local$/.test(host) || /\.internal$/.test(host) ||
    /^(127|10|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    host.indexOf(":") >= 0 || /^\d+$/.test(host);
  if (interno) return "Use o endereço público do túnel (https://…), não o endereço interno da rede. Nunca abra a porta do DVR.";
  return "";
}

// Caminho dentro do gateway: sem "..", sem barra inicial, sem outro endereço.
function caminhoSeguro(c) {
  c = String(c || "");
  return !(c.indexOf("..") >= 0 || c.indexOf("\\") >= 0 || c.indexOf("://") >= 0 || /^\//.test(c) || /[\r\n]/.test(c));
}

function validarCamera(r) {
  const tipo = r.getString("tipo_integracao");
  if (TIPOS_CAMERA.indexOf(tipo) < 0) throw new BadRequestError("Escolha o tipo da câmera.");
  if (r.getString("nome").trim().length < 2) throw new BadRequestError("Dê um nome para a câmera (ex.: Box 1).");
  if (tipo === "app_fabricante") {
    if (!/^https:\/\//i.test(r.getString("link_app"))) throw new BadRequestError("Cole o link https:// do app ou da nuvem do fabricante.");
    return;
  }
  if (tipo === "demonstracao") return;
  const erro = enderecoGatewayPermitido(r.getString("endereco_stream"));
  if (erro) throw new BadRequestError(erro);
  const caminho = r.getString("caminho").replace(/^\/+/, "");
  r.set("caminho", caminho);
  if (!caminho) throw new BadRequestError(tipo === "hls" ? "Informe o caminho do vídeo (ex.: box1/index.m3u8)." : "Informe o caminho da imagem (ex.: api/frame.jpeg?src=box1).");
  if (!caminhoSeguro(caminho.split("?")[0])) throw new BadRequestError("Caminho inválido.");
}

function escaparXml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Quadro da câmera de demonstração: relógio de São Paulo e um carro andando.
function quadroDemonstracao(nome, agora) {
  const d = new Date(agora - OFFSET_SP);
  const p2 = (n) => (n < 10 ? "0" : "") + n;
  const hora = p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" + p2(d.getUTCSeconds());
  const data = p2(d.getUTCDate()) + "/" + p2(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
  const x = 40 + ((d.getUTCSeconds() * 1000 + (agora % 1000)) / 60000) * 460;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
    '<rect width="640" height="360" fill="#1d2a33"/>' +
    '<rect y="250" width="640" height="110" fill="#2c3a44"/>' +
    '<g fill="#3e5260"><rect x="0" y="296" width="640" height="4"/></g>' +
    '<g transform="translate(' + x.toFixed(0) + ',190)">' +
    '<rect x="0" y="22" width="140" height="40" rx="10" fill="#0e7490"/>' +
    '<rect x="26" y="0" width="80" height="34" rx="10" fill="#0e7490"/>' +
    '<rect x="36" y="6" width="28" height="20" rx="4" fill="#a5d8e6"/><rect x="70" y="6" width="28" height="20" rx="4" fill="#a5d8e6"/>' +
    '<circle cx="32" cy="62" r="14" fill="#111"/><circle cx="108" cy="62" r="14" fill="#111"/></g>' +
    '<rect x="16" y="16" width="220" height="34" rx="6" fill="rgba(0,0,0,.55)"/>' +
    '<circle cx="34" cy="33" r="7" fill="#e5484d"/>' +
    '<text x="50" y="39" font-family="sans-serif" font-size="17" font-weight="700" fill="#fff">AO VIVO · DEMONSTRAÇÃO</text>' +
    '<text x="624" y="40" text-anchor="end" font-family="monospace" font-size="22" fill="#fff">' + data + " " + hora + "</text>" +
    '<text x="16" y="340" font-family="sans-serif" font-size="20" font-weight="700" fill="#fff">' + escaparXml(nome) + "</text>" +
    "</svg>"
  );
}

module.exports = {
  TIPOS_CAMERA,
  PASSE_CAMERA_S,
  segredoServidor,
  enderecoGatewayPermitido,
  caminhoSeguro,
  validarCamera,
  quadroDemonstracao,
  TEXTOS_PADRAO,
  textoDoAviso,
  chavesPush,
  notificarUsuario,
  notificarEntrada,
  inicioDiaSP,
  inicioMesSP,
  inicioMesSeguinteSP,
  mesCompetencia,
  painelDaEmpresa,
  areaDoFuncionario,
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
