#!/usr/bin/env node
// Teste da Etapa 5: painéis, caixa, metas, bônus, vales e holerites.
// "Gerente não vê bônus/vales; funcionário vê só os seus."
// Roda contra um PocketBase de DESENVOLVIMENTO (cria e apaga dados "teste-*").
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-paineis.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;

async function api(method, path, { token, body, form } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: { ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: token } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra) : ""));
  }
}
const negado = (r) => r.status === 403 || r.status === 404 || r.status === 400;
const agoraPB = () => new Date().toISOString().replace("T", " ");

function pdfFalso() {
  return new Blob(["%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"], { type: "application/pdf" });
}

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", {
    body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD },
  });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body, token = ADM) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token, body });
    if (r.status !== 200) throw new Error(`Falha ao criar ${col}: ${JSON.stringify(r.data)}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  let seq = 0;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", {
      nome, celular: "115" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token };
  };

  try {
    console.log("Preparando um dia de movimento…");
    const A = await criar("empresas", { nome: "Teste Painel A", slug: "teste-pa-" + sufixo, ativo: true, comissao_ativa: true });
    const B = await criar("empresas", { nome: "Teste Painel B", slug: "teste-pb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão A", A, "patrao");
    const gerente = await pessoa("Gerente A", A, "gerente");
    const func = await pessoa("Funcionário A", A, "funcionario");
    const func2 = await pessoa("Outro Funcionário A", A, "funcionario");
    const cliente = await pessoa("Cliente A", A, "cliente");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const funcB = await pessoa("Funcionário B", B, "funcionario");
    const servico = await criar("servicos", { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true });
    const produto = await criar("produtos", {
      empresa: A.id, nome: "Cheirinho", preco: 15, estoque: 3, estoque_minimo: 2, comissao_tipo: "fixo", comissao_valor: 2, ativo: true,
    });
    // 3 carros lavados hoje: 2 pelo funcionário, 1 pelo outro (um deles começou 25 min atrasado)
    const agora = Date.now();
    for (const [lavador, atraso] of [[func, 25], [func, 0], [func2, 0]]) {
      await criar("fila_entradas", {
        empresa: A.id, servico: servico.id, origem: "balcao", ordem: seq++, status: "finalizado", nome_avulso: "Carro",
        duracao_min: 30, preco_servico: 40, lavado_por: lavador.usuario.id,
        previsao_inicio: new Date(agora - 60 * 60000).toISOString().replace("T", " "),
        inicio_em: new Date(agora - (60 - atraso) * 60000).toISOString().replace("T", " "),
        finalizado_em: agoraPB(),
      });
    }
    // Venda do funcionário: 2 cheirinhos (R$30, comissão 2×2 = R$4) → estoque 1 (abaixo do mínimo)
    let r = await api("POST", "/api/lr/vendas", {
      token: func.token, body: { empresa: A.id, itens: [{ produto: produto.id, quantidade: 2 }], forma_pagamento: "pix", fechar: true },
    });
    checar("venda do dia registrada", r.status === 201, r.data);

    // ---------------------------------------------------------------- caixa
    console.log("\nCaixa (gastos e entradas)");
    r = await api("POST", "/api/collections/lancamentos_caixa/records", {
      token: patrao.token, body: { empresa: A.id, data: agoraPB(), tipo: "saida", categoria: "Produtos de limpeza", valor: 50, criado_por: patrao.usuario.id },
    });
    checar("patrão lança gasto", r.status === 200, r.data);
    const gasto = r.data;
    await api("POST", "/api/collections/lancamentos_caixa/records", {
      token: patrao.token, body: { empresa: A.id, data: agoraPB(), tipo: "entrada", categoria: "Outros", valor: 20, criado_por: patrao.usuario.id },
    });
    r = await api("POST", "/api/collections/lancamentos_caixa/records", {
      token: gerente.token, body: { empresa: A.id, data: agoraPB(), tipo: "saida", categoria: "X", valor: 1, criado_por: gerente.usuario.id },
    });
    checar("gerente NÃO lança no caixa", negado(r), r.status);
    r = await api("POST", "/api/collections/lancamentos_caixa/records", {
      token: patrao.token, body: { empresa: A.id, data: agoraPB(), tipo: "saida", categoria: "X", valor: 1, criado_por: gerente.usuario.id },
    });
    checar("lançamento sempre em nome de quem lançou", negado(r), r.status);
    r = await api("GET", "/api/collections/lancamentos_caixa/records", { token: gerente.token });
    checar("gerente lê o caixa", r.data.items.length === 2, r.data.items.length);
    r = await api("GET", "/api/collections/lancamentos_caixa/records", { token: func.token });
    checar("funcionário não vê o caixa", r.data.items.length === 0);
    r = await api("GET", "/api/collections/lancamentos_caixa/records", { token: patraoB.token });
    checar("patrão B não vê o caixa da A", r.data.items.length === 0);
    r = await api("DELETE", `/api/collections/lancamentos_caixa/records/${gasto.id}`, { token: patrao.token });
    checar("lançamento não se apaga (só cancela)", negado(r), r.status);

    // ---------------------------------------------------------------- metas
    console.log("\nMetas");
    r = await api("POST", "/api/collections/metas/records", { token: patrao.token, body: { empresa: A.id, periodo: "dia", valor: 500 } });
    checar("patrão define meta do dia", r.status === 200, r.data);
    await api("POST", "/api/collections/metas/records", { token: patrao.token, body: { empresa: A.id, periodo: "mes", valor: 12000 } });
    r = await api("POST", "/api/collections/metas/records", { token: gerente.token, body: { empresa: A.id, periodo: "dia", valor: 1 } });
    checar("gerente não define meta", negado(r), r.status);
    r = await api("GET", "/api/collections/metas/records", { token: gerente.token });
    checar("gerente lê as metas", r.data.items.length === 2);
    r = await api("GET", "/api/collections/metas/records", { token: func.token });
    checar("funcionário não vê metas", r.data.items.length === 0);

    // ---------------------------------------------------------------- bônus
    console.log("\nRegra de bônus (só o patrão)");
    r = await api("POST", "/api/collections/regras_bonus/records", { token: patrao.token, body: { empresa: A.id, valor_por_carro: 5, ativo: true } });
    checar("patrão define R$5 por carro lavado", r.status === 200, r.data);
    r = await api("GET", "/api/collections/regras_bonus/records", { token: gerente.token });
    checar("gerente NÃO vê a regra de bônus", r.data.items.length === 0);
    r = await api("GET", "/api/collections/regras_bonus/records", { token: func.token });
    checar("funcionário NÃO vê a regra de bônus", r.data.items.length === 0);

    // ---------------------------------------------------------------- vales
    console.log("\nVales e adiantamentos");
    const formVale = (funcionario, valor, lancado_por) => {
      const f = new FormData();
      f.append("empresa", A.id);
      f.append("funcionario", funcionario);
      f.append("valor", String(valor));
      f.append("data", agoraPB());
      f.append("lancado_por", lancado_por);
      f.append("observacao", "Pix");
      f.append("comprovante", pdfFalso(), "comprovante.pdf");
      return f;
    };
    r = await api("POST", "/api/collections/vales/records", { token: patrao.token, form: formVale(func.usuario.id, 100, patrao.usuario.id) });
    checar("patrão lança vale com comprovante para o funcionário", r.status === 200 && !!r.data.comprovante, r.data);
    const valeFunc = r.data;
    r = await api("POST", "/api/collections/vales/records", { token: patrao.token, form: formVale(gerente.usuario.id, 80, patrao.usuario.id) });
    const valeGerente = r.data;
    r = await api("POST", "/api/collections/vales/records", { token: gerente.token, form: formVale(func.usuario.id, 1, gerente.usuario.id) });
    checar("gerente NÃO lança vale", negado(r), r.status);
    r = await api("POST", "/api/collections/vales/records", { token: func.token, form: formVale(func.usuario.id, 999, func.usuario.id) });
    checar("funcionário NÃO lança vale", negado(r), r.status);
    r = await api("POST", "/api/collections/vales/records", { token: patrao.token, form: formVale(funcB.usuario.id, 1, patrao.usuario.id) });
    checar("patrão não lança vale para alguém de outra empresa", negado(r), r.status);
    r = await api("POST", "/api/collections/vales/records", { token: patrao.token, form: formVale(cliente.usuario.id, 1, patrao.usuario.id) });
    checar("patrão não lança vale para cliente", negado(r), r.status);
    r = await api("GET", "/api/collections/vales/records", { token: func.token });
    checar("funcionário vê só os próprios vales", r.data.items.length === 1 && r.data.items[0].id === valeFunc.id, r.data.items.length);
    r = await api("GET", "/api/collections/vales/records", { token: gerente.token });
    checar("gerente vê só o PRÓPRIO vale (não o dos outros)", r.data.items.length === 1 && r.data.items[0].id === valeGerente.id, r.data.items.map((v) => v.funcionario));
    r = await api("GET", "/api/collections/vales/records", { token: func2.token });
    checar("outro funcionário não vê vales alheios", r.data.items.length === 0);
    r = await api("GET", "/api/collections/vales/records", { token: patrao.token });
    checar("patrão vê todos os vales", r.data.items.length === 2);
    r = await api("GET", "/api/collections/vales/records", { token: patraoB.token });
    checar("patrão B não vê vales da A", r.data.items.length === 0);

    console.log("\nComprovante protegido");
    const urlArq = `/api/files/vales/${valeFunc.id}/${valeFunc.comprovante}`;
    let res = await fetch(PB + urlArq);
    checar("sem login o comprovante não abre", res.status === 403 || res.status === 404, res.status);
    const tokenArq = async (p) => (await api("POST", "/api/files/token", { token: p.token })).data.token;
    res = await fetch(`${PB}${urlArq}?token=${await tokenArq(func)}`);
    checar("o próprio funcionário abre o comprovante", res.status === 200, res.status);
    res = await fetch(`${PB}${urlArq}?token=${await tokenArq(patrao)}`);
    checar("o patrão abre o comprovante", res.status === 200, res.status);
    res = await fetch(`${PB}${urlArq}?token=${await tokenArq(gerente)}`);
    checar("o gerente NÃO abre o comprovante de outro", res.status === 403 || res.status === 404, res.status);
    res = await fetch(`${PB}${urlArq}?token=${await tokenArq(func2)}`);
    checar("outro funcionário NÃO abre", res.status === 403 || res.status === 404, res.status);

    // ------------------------------------------------------------- holerites
    console.log("\nHolerites");
    const competencia = new Date().toISOString().slice(0, 7);
    const formHol = (funcionario) => {
      const f = new FormData();
      f.append("empresa", A.id);
      f.append("funcionario", funcionario);
      f.append("competencia", competencia);
      f.append("lancado_por", patrao.usuario.id);
      f.append("arquivo", pdfFalso(), "holerite.pdf");
      return f;
    };
    r = await api("POST", "/api/collections/holerites/records", { token: patrao.token, form: formHol(func.usuario.id) });
    checar("patrão anexa holerite", r.status === 200, r.data);
    const hol = r.data;
    r = await api("GET", "/api/collections/holerites/records", { token: func.token });
    checar("funcionário vê o próprio holerite", r.data.items.length === 1);
    r = await api("GET", "/api/collections/holerites/records", { token: gerente.token });
    checar("gerente NÃO vê holerite de outro", r.data.items.length === 0);
    res = await fetch(`${PB}/api/files/holerites/${hol.id}/${hol.arquivo}?token=${await tokenArq(gerente)}`);
    checar("gerente NÃO abre o arquivo do holerite de outro", res.status === 403 || res.status === 404, res.status);

    // ---------------------------------------------------------------- painel
    console.log("\nPainel do dia");
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func.token });
    checar("funcionário não vê o painel", r.status === 403, r.status);
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: patraoB.token });
    checar("patrão B não vê o painel da A", r.status === 403, r.status);
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: gerente.token });
    checar("gerente vê o painel", r.status === 200, r.data);
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: patrao.token });
    const p = r.data;
    checar("carros lavados hoje: 3", p.carros_lavados === 3, p.carros_lavados);
    checar("faturamento: serviços R$120 + produtos R$30 = R$150", p.faturamento.servicos === 120 && p.faturamento.produtos === 30 && p.faturamento.total === 150, p.faturamento);
    checar("caixa: entradas R$20, gastos R$50", p.caixa.entradas === 20 && p.caixa.saidas === 50, p.caixa);
    checar("saldo: 150 + 20 − 50 = R$120", p.saldo === 120, p.saldo);
    checar("formas de pagamento: Pix R$30", p.por_forma_pagamento.pix === 30, p.por_forma_pagamento);
    checar("meta do dia R$500, realizado R$150", p.metas.dia === 500 && p.metas.realizado_dia === 150, p.metas);
    const rf = p.ranking_funcionarios.find((x) => x.usuario === func.usuario.id);
    checar("ranking: funcionário com R$30 em vendas e 2 carros", rf && rf.vendas_total === 30 && rf.carros === 2 && rf.nome === "Funcionário A", p.ranking_funcionarios);
    checar("ranking de produtos: Cheirinho 2 un.", p.ranking_produtos[0]?.nome === "Cheirinho" && p.ranking_produtos[0]?.quantidade === 2, p.ranking_produtos);
    checar("estoque baixo: Cheirinho (1)", p.estoque_baixo.some((x) => x.nome === "Cheirinho" && x.estoque === 1), p.estoque_baixo);
    checar("atraso da equipe registrado (25 min)", p.atrasos.total === 1 && p.atrasos.lista[0].minutos === 25, p.atrasos);
    checar("painel não traz bônus nem vales", !JSON.stringify(p).includes("bonus") && !JSON.stringify(p).includes("vale"));

    // ------------------------------------------------------------ minha área
    console.log("\nMinha área");
    r = await api("GET", `/api/lr/minha-area/${A.id}`, { token: func.token });
    const area = r.data;
    checar("funcionário vê os próprios carros: 2 hoje / 2 no mês", area.carros.hoje === 2 && area.carros.mes === 2, area.carros);
    checar("bônus estimado: 2 × R$5 + comissão R$4 = R$14", area.bonus.estimado === 14 && area.bonus.comissao === 4, area.bonus);
    checar("vales do mês: R$100; saldo estimado: −R$86", area.vales.total === 100 && area.saldo_estimado === -86, area);
    r = await api("GET", `/api/lr/minha-area/${A.id}?funcionario=${func2.usuario.id}`, { token: func.token });
    checar("funcionário NÃO vê a área de outro", r.status === 403, r.status);
    r = await api("GET", `/api/lr/minha-area/${A.id}?funcionario=${func.usuario.id}`, { token: gerente.token });
    checar("gerente NÃO vê bônus/vales de outro", r.status === 403, r.status);
    r = await api("GET", `/api/lr/minha-area/${A.id}`, { token: gerente.token });
    checar("gerente vê a própria área (vale de R$80)", r.status === 200 && r.data.vales.total === 80, r.data);
    r = await api("GET", `/api/lr/minha-area/${A.id}?funcionario=${func.usuario.id}`, { token: patrao.token });
    checar("patrão vê a área de qualquer pessoa da equipe", r.status === 200 && r.data.bonus.estimado === 14, r.data);
    r = await api("GET", `/api/lr/minha-area/${A.id}?funcionario=${cliente.usuario.id}`, { token: patrao.token });
    checar("área de cliente não existe", r.status === 404, r.status);
    r = await api("GET", `/api/lr/minha-area/${A.id}`, { token: cliente.token });
    checar("cliente não tem área de funcionário", r.status === 403, r.status);
    r = await api("GET", `/api/lr/minha-area/${A.id}`, { token: funcB.token });
    checar("funcionário de outra empresa não acessa", r.status === 403, r.status);

    console.log("\nAuditoria");
    r = await api("GET", `/api/collections/auditoria/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: patrao.token });
    const acoes = new Set(r.data.items.map((a) => a.acao));
    checar("caixa, metas, bônus, vales e holerites registrados",
      ["lancamentos_caixa_criar", "metas_criar", "regras_bonus_criar", "vales_criar", "holerites_criar"].every((a) => acoes.has(a)), [...acoes]);

    console.log("\nLimpando dados de teste…");
    for (const col of ["auditoria", "vendas", "fila_entradas", "vales", "holerites", "lancamentos_caixa"]) {
      const lista = await api("GET", `/api/collections/${col}/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
      for (const x of lista.data.items) await api("DELETE", `/api/collections/${col}/records/${x.id}`, { token: ADM });
    }
    await api("DELETE", `/api/collections/produtos/records/${produto.id}`, { token: ADM });
  } finally {
    // Empresa primeiro (leva junto lavagens, vendas e histórico do teste), depois as pessoas.
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
  }

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
