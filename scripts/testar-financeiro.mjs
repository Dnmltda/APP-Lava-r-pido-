#!/usr/bin/env node
// Teste: fotos antes/depois, tipos de veículo e preços, gastos fixos,
// fechamento do dia (notas anexadas) e fechamento do mês.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-financeiro.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}
const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 300) : ""));
  }
}
async function api(method, path, { token, body, form } = {}, tentativa = 0) {
  const res = await fetch(PB + path, {
    method,
    headers: { ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: token } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  if (res.status === 429 && tentativa < 15) {
    await new Promise((r) => setTimeout(r, 5000));
    return api(method, path, { token, body, form }, tentativa + 1);
  }
  const texto = await res.text();
  let data = null;
  try {
    data = JSON.parse(texto);
  } catch {}
  return { status: res.status, data, texto };
}
const ok = (r) => r.status >= 200 && r.status < 300;
const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400;
const qs = encodeURIComponent;
// Imagem PNG 1x1 e um PDF mínimo (arquivos de verdade, o servidor confere o tipo pelo conteúdo).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const arquivo = (buf, nome, tipo) => new Blob([buf], { type: tipo });
function formulario(campos, arquivos) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, String(v));
  for (const [k, buf, nome, tipo] of arquivos) f.append(k, arquivo(buf, nome, tipo), nome);
  return f;
}

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD } });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token: ADM, body });
    if (!ok(r)) throw new Error(`Falha ao criar ${col}: ${r.texto}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  let seq = 0;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", { nome, celular: "111" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345" });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token, id: u.id };
  };

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Financeiro", slug: "teste-fin-" + sufixo, ativo: true, capacidade_simultanea: 3 });
    const B = await criar("empresas", { nome: "Teste Financeiro B", slug: "teste-finb-" + sufixo, ativo: true });
    const patrao = await pessoa("Dono", A, "patrao");
    const gerente = await pessoa("Gerente", A, "gerente");
    const resp = await pessoa("Responsável", A, "funcionario", { responsavel_fila: true });
    const func = await pessoa("Funcionário", A, "funcionario");
    const c1 = await pessoa("Cliente Um", A, "cliente");
    const c2 = await pessoa("Cliente Dois", A, "cliente");
    const patraoB = await pessoa("Dono B", B, "patrao");
    const servico = await criar("servicos", { empresa: A.id, nome: "Completa", preco: 50, duracao_media_min: 30, ativo: true });
    const servB = await criar("servicos", { empresa: B.id, nome: "B", preco: 10, duracao_media_min: 30, ativo: true });
    const v1 = await criar("veiculos", { cliente: c1.id, final_placa: "U01", ativo: true });

    console.log("\nTipos de veículo e preço por tipo");
    let r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, {
      token: patrao.token,
      body: { tipos_veiculo: [{ nome: " Pequeno " }, { nome: "Grande / SUV" }, { nome: "Motorista de app", restrito: true }] },
    });
    const tipos = r.data && r.data.tipos_veiculo;
    checar("dono cria os tipos de veículo da empresa", r.status === 200 && tipos.length === 3 && tipos.every((t) => t.id) && tipos[0].nome === "Pequeno", r.data);
    const [tPeq, tGrande, tApp] = tipos;
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: gerente.token, body: { tipos_veiculo: [] } });
    checar("gerente não mexe nos tipos (configuração do dono)", negado(r), r.status);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { tipos_veiculo: [{ nome: "X" }] } });
    checar("tipo sem nome direito é recusado", r.status === 400, r.status);
    r = await api("PATCH", `/api/collections/servicos/records/${servico.id}`, { token: patrao.token, body: { precos_tipo: { [tGrande.id]: 80, [tApp.id]: "35", [tPeq.id]: "" } } });
    checar("dono define preço do serviço por tipo", r.status === 200 && r.data.precos_tipo[tGrande.id] === 80 && r.data.precos_tipo[tApp.id] === 35 && !(tPeq.id in r.data.precos_tipo), r.data && r.data.precos_tipo);
    r = await api("PATCH", `/api/collections/servicos/records/${servico.id}`, { token: patrao.token, body: { precos_tipo: { x: -5 } } });
    checar("preço negativo é recusado", r.status === 400, r.status);

    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: servico.id, veiculo: v1.id, tipo_veiculo: tGrande.id } });
    let e1 = (await api("GET", `/api/collections/fila_entradas/records/${r.data.id}`, { token: ADM })).data;
    checar("cliente escolhe 'Grande': preço do grande", e1.preco_servico === 80 && e1.tipo_veiculo_nome === "Grande / SUV", e1);
    await api("POST", `/api/lr/fila/${e1.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: servico.id, veiculo: v1.id, tipo_veiculo: tApp.id } });
    e1 = (await api("GET", `/api/collections/fila_entradas/records/${r.data.id}`, { token: ADM })).data;
    checar("cliente NÃO consegue se colocar como 'Motorista de app' (restrito)", e1.preco_servico === 50 && !e1.tipo_veiculo, e1);
    r = await api("POST", `/api/lr/fila/${e1.id}/tipo`, { token: func.token, body: { tipo: tApp.id } });
    checar("funcionário comum não muda o tipo", negado(r), r.status);
    r = await api("POST", `/api/lr/fila/${e1.id}/tipo`, { token: resp.token, body: { tipo: tApp.id, lembrar: true } });
    checar("responsável pela fila define 'Motorista de app' e o preço cai", r.status === 200 && r.data.preco_servico === 35, r.data);
    await api("POST", `/api/lr/fila/${e1.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: servico.id, veiculo: v1.id, tipo_veiculo: tPeq.id } });
    e1 = (await api("GET", `/api/collections/fila_entradas/records/${r.data.id}`, { token: ADM })).data;
    checar("na próxima vez o carro já entra como 'Motorista de app' (a equipe lembrou)", e1.preco_servico === 35 && e1.tipo_veiculo === tApp.id, e1);
    r = await api("POST", "/api/lr/fila/balcao", { token: gerente.token, body: { empresa: A.id, servico: servico.id, nome: "Balcão Grande", final_placa: "BG1", tipo_veiculo: tGrande.id } });
    const balcao = (await api("GET", `/api/collections/fila_entradas/records/${r.data.id}`, { token: ADM })).data;
    checar("cliente de balcão com tipo: preço certo", balcao.preco_servico === 80, balcao.preco_servico);
    r = await api("POST", "/api/lr/fila/balcao", { token: gerente.token, body: { empresa: A.id, servico: servico.id, nome: "Sem Tipo", final_placa: "ST1" } });
    const semTipo = (await api("GET", `/api/collections/fila_entradas/records/${r.data.id}`, { token: ADM })).data;
    checar("sem tipo: preço normal do serviço", semTipo.preco_servico === 50, semTipo.preco_servico);

    console.log("\nFotos antes e depois");
    const fotos = (entrada, momento, empresa = A.id, criado = null, quem) =>
      api("POST", "/api/collections/vistorias/records", {
        token: quem.token,
        form: formulario({ empresa, entrada, momento, avarias: "Risco na porta traseira", criado_por: criado || quem.id }, [["fotos", PNG, "a.png", "image/png"], ["fotos", PNG, "b.png", "image/png"]]),
      });
    r = await fotos(e1.id, "antes", A.id, null, resp);
    const vAntes = r.data;
    checar("responsável pela fila tira fotos de antes (com avarias anotadas)", r.status === 200 && vAntes.fotos.length === 2 && vAntes.avarias.includes("Risco"), r.data);
    r = await fotos(e1.id, "depois", A.id, null, gerente);
    checar("gerente tira fotos de depois", r.status === 200, r.status);
    r = await fotos(e1.id, "antes", A.id, null, patrao);
    checar("dono também pode", r.status === 200, r.status);
    r = await fotos(e1.id, "antes", A.id, null, func);
    checar("funcionário comum não tira fotos", negado(r), r.status);
    r = await fotos(e1.id, "antes", A.id, null, c1);
    checar("cliente não tira fotos", negado(r), r.status);
    r = await fotos(e1.id, "antes", A.id, null, patraoB);
    checar("dono de outra empresa não tira fotos aqui", negado(r), r.status);
    r = await fotos(e1.id, "antes", A.id, gerente.id, resp);
    checar("não dá para registrar a foto em nome de outra pessoa", negado(r), r.status);
    r = await fotos(e1.id, "antes", B.id, null, patraoB);
    checar("não dá para pendurar foto em carro de outra empresa", negado(r), r.status);
    r = await api("GET", `/api/collections/vistorias/records?filter=${qs(`entrada="${e1.id}"`)}`, { token: c1.token });
    checar("cliente vê as fotos do próprio carro", r.status === 200 && r.data.items.length === 3, r.data && r.data.items && r.data.items.length);
    r = await api("GET", `/api/collections/vistorias/records?filter=${qs(`entrada="${e1.id}"`)}`, { token: c2.token });
    checar("outro cliente não vê", r.status === 200 && r.data.items.length === 0);
    r = await api("GET", `/api/collections/vistorias/records?filter=${qs(`entrada="${e1.id}"`)}`, { token: func.token });
    checar("equipe vê as fotos", r.status === 200 && r.data.items.length === 3);
    const urlFoto = `/api/files/vistorias/${vAntes.id}/${vAntes.fotos[0]}`;
    checar("foto não abre sem passe (arquivo protegido)", (await fetch(PB + urlFoto)).status >= 400);
    const tk = (await api("POST", "/api/files/token", { token: c1.token })).data.token;
    checar("com o passe do cliente a foto abre", (await fetch(`${PB}${urlFoto}?token=${tk}`)).status === 200);
    r = await api("PATCH", `/api/collections/vistorias/records/${vAntes.id}`, { token: gerente.token, body: { avarias: "nada" } });
    checar("foto é prova: ninguém edita", negado(r), r.status);
    r = await api("DELETE", `/api/collections/vistorias/records/${vAntes.id}`, { token: patrao.token });
    checar("nem apaga (nem o dono)", negado(r), r.status);

    console.log("\nGastos fixos");
    const hoje = new Date(Date.now() - 3 * 3600000).getUTCDate();
    const comp = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7);
    r = await api("POST", "/api/collections/gastos_fixos/records", { token: patrao.token, body: { empresa: A.id, descricao: "Aluguel", categoria: "Aluguel", valor: 1500, dia: 1, ativo: true, criado_por: patrao.id } });
    const fixo = r.data;
    checar("dono cadastra gasto fixo (aluguel todo dia 1)", r.status === 200, r.data);
    let l = await api("GET", `/api/collections/lancamentos_caixa/records?filter=${qs(`gasto_fixo="${fixo.id}"`)}`, { token: patrao.token });
    checar("já vencido no mês: entra sozinho no caixa", l.data.items.length === 1 && l.data.items[0].valor === 1500 && l.data.items[0].competencia === comp, l.data.items);
    await api("PATCH", `/api/collections/gastos_fixos/records/${fixo.id}`, { token: patrao.token, body: { descricao: "Aluguel do galpão" } });
    l = await api("GET", `/api/collections/lancamentos_caixa/records?filter=${qs(`gasto_fixo="${fixo.id}"`)}`, { token: patrao.token });
    checar("não lança duas vezes no mesmo mês", l.data.items.length === 1, l.data.items.length);
    if (hoje < 28) {
      r = await api("POST", "/api/collections/gastos_fixos/records", { token: patrao.token, body: { empresa: A.id, descricao: "Internet", categoria: "Internet", valor: 120, dia: 28, ativo: true, criado_por: patrao.id } });
      l = await api("GET", `/api/collections/lancamentos_caixa/records?filter=${qs(`gasto_fixo="${r.data.id}"`)}`, { token: patrao.token });
      checar("ainda não venceu (dia 28): só entra no dia", l.data.items.length === 0, l.data.items.length);
    }
    r = await api("POST", "/api/collections/gastos_fixos/records", { token: gerente.token, body: { empresa: A.id, descricao: "X", categoria: "X", valor: 1, dia: 1, ativo: true, criado_por: gerente.id } });
    checar("gerente não cadastra gasto fixo", negado(r), r.status);
    r = await api("GET", `/api/collections/gastos_fixos/records?filter=${qs(`empresa="${A.id}"`)}`, { token: gerente.token });
    checar("gerente acompanha os gastos fixos", r.status === 200 && r.data.items.length >= 1);
    r = await api("GET", `/api/collections/gastos_fixos/records?filter=${qs(`empresa="${A.id}"`)}`, { token: func.token });
    checar("funcionário não vê os gastos fixos", r.status === 200 && r.data.items.length === 0);

    console.log("\nFechamento do dia (notas anexadas)");
    const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const fechar = (quem, campos, arquivos) =>
      api("POST", "/api/collections/fechamentos_dia/records", { token: quem.token, form: formulario({ empresa: A.id, dia, criado_por: quem.id, ...campos }, arquivos) });
    r = await fechar(gerente, { cartao: 230.5, pix: 120, dinheiro: 80, observacao: "Maquininha 1 e 2" }, [["anexos", PDF, "maquininha.pdf", "application/pdf"], ["anexos", PNG, "nota.png", "image/png"]]);
    const fech = r.data;
    checar("gerente faz o fechamento do dia com as notas anexadas", r.status === 200 && fech.anexos.length === 2 && fech.cartao === 230.5, r.data);
    r = await fechar(patrao, { cartao: 1 }, []);
    checar("um fechamento por dia (o segundo é recusado)", r.status === 400, r.status);
    r = await api("PATCH", `/api/collections/fechamentos_dia/records/${fech.id}`, { token: patrao.token, form: formulario({ dinheiro: 95 }, [["anexos+", PNG, "nota2.png", "image/png"]]) });
    checar("dono completa o fechamento e anexa mais uma nota", r.status === 200 && r.data.anexos.length === 3 && r.data.dinheiro === 95 && r.data.atualizado_por === patrao.id, r.data);
    r = await api("PATCH", `/api/collections/fechamentos_dia/records/${fech.id}`, { token: gerente.token, body: { dia: "2020-01-01" } });
    checar("não troca a data de um fechamento", negado(r), r.status);
    r = await fechar(func, { cartao: 1 }, []);
    checar("funcionário não faz fechamento", negado(r), r.status);
    r = await api("GET", `/api/collections/fechamentos_dia/records?filter=${qs(`empresa="${A.id}"`)}`, { token: func.token });
    checar("funcionário não vê os fechamentos", r.data.items.length === 0);
    await api("PATCH", `/api/collections/vinculos/records/${func.vinculo.id}`, { token: patrao.token, body: { perm_valores: true } });
    r = await api("GET", `/api/collections/fechamentos_dia/records?filter=${qs(`empresa="${A.id}"`)}`, { token: func.token });
    checar("com 'valores' liberado pelo dono, acompanha (só ver)", r.data.items.length === 1);
    r = await fechar(func, { cartao: 1 }, []);
    checar("mas continua sem fazer fechamento", negado(r), r.status);
    r = await api("GET", `/api/collections/fechamentos_dia/records?filter=${qs(`empresa="${A.id}"`)}`, { token: c1.token });
    checar("cliente não vê", r.data.items.length === 0);
    const urlNota = `/api/files/fechamentos_dia/${fech.id}/${fech.anexos[0]}`;
    checar("nota não abre sem passe", (await fetch(PB + urlNota)).status >= 400);
    const tkG = (await api("POST", "/api/files/token", { token: gerente.token })).data.token;
    checar("com o passe do gerente a nota abre", (await fetch(`${PB}${urlNota}?token=${tkG}`)).status === 200);
    r = await api("DELETE", `/api/collections/fechamentos_dia/records/${fech.id}`, { token: patrao.token });
    checar("fechamento não se apaga", negado(r), r.status);

    console.log("\nFechamento do mês");
    r = await api("GET", `/api/lr/fechamento-mes/${A.id}`, { token: patrao.token });
    const fm = r.data;
    checar("dono vê o fechamento do mês", r.status === 200, r.status);
    checar("gastos fixos separados dos variáveis", fm && fm.caixa.fixos === 1500 && fm.caixa.por_categoria.some((c) => c.categoria === "Aluguel"), fm && fm.caixa);
    checar("traz a conferência dos fechamentos do dia", fm && fm.fechamentos_dia.dias === 1 && fm.fechamentos_dia.cartao === 230.5 && fm.fechamentos_dia.anexos === 3, fm && fm.fechamentos_dia);
    checar("saldo = faturamento + entradas − saídas", fm && fm.saldo === Math.round((fm.faturamento.total + fm.caixa.entradas - fm.caixa.saidas) * 100) / 100, fm);
    checar("dono vê os vales do mês", fm && "vales" in fm);
    r = await api("GET", `/api/lr/fechamento-mes/${A.id}`, { token: gerente.token });
    checar("gerente vê o fechamento do mês, sem os vales (são do dono)", r.status === 200 && !("vales" in r.data), r.data);
    await api("PATCH", `/api/collections/vinculos/records/${func.vinculo.id}`, { token: patrao.token, body: { perm_valores: false } });
    r = await api("GET", `/api/lr/fechamento-mes/${A.id}`, { token: func.token });
    checar("funcionário sem acesso não vê", negado(r), r.status);
    r = await api("GET", `/api/lr/fechamento-mes/${A.id}`, { token: patraoB.token });
    checar("dono de outra empresa não vê", negado(r), r.status);
    void servB;
  } finally {
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
