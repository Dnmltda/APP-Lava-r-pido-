#!/usr/bin/env node
// Teste: privacidade dos clientes (auditoria 24/10/2026, S1 e S2). A equipe só lê clientes e carros com a
// permissão "Lista de clientes" (ou sendo o dono); sem ela, só quem está sendo atendido agora.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-privacidade-clientes.mjs

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
  const token = async (u) => (await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } })).data.token;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", { nome, celular: "115" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345" });
    await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    return { id: u.id, nome, token: await token(u) };
  };
  const carro = async (quem, modelo, placa) =>
    (await api("POST", "/api/collections/veiculos/records", { token: quem.token, body: { cliente: quem.id, final_placa: placa, modelo, cor: "Prata", ativo: true } })).data;
  // O que cada pessoa enxerga pela API direta (lista completa de usuarios e veiculos).
  const pessoasQueVe = async (quem) => (await api("GET", "/api/collections/usuarios/records?perPage=500", { token: quem.token })).data?.items?.map((x) => x.id) || [];
  const carrosQueVe = async (quem) => (await api("GET", "/api/collections/veiculos/records?perPage=500", { token: quem.token })).data?.items?.map((x) => x.id) || [];
  const ve = async (quem, alvo) => (await pessoasQueVe(quem)).includes(alvo.id);
  const veCarro = async (quem, v) => (await carrosQueVe(quem)).includes(v.id);

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Teste Privacidade A", slug: "teste-priv-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const B = await criar("empresas", { nome: "Teste Privacidade B", slug: "teste-privb-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const patrao = await pessoa("Dono A", A, "patrao");
    const gerente = await pessoa("Gerente A", A, "gerente");
    const resp = await pessoa("Responsável A", A, "funcionario", { responsavel_fila: true });
    const func = await pessoa("Funcionário A", A, "funcionario");
    const comLista = await pessoa("Funcionário com lista A", A, "funcionario", { perm_clientes: true });
    const patraoB = await pessoa("Dono B", B, "patrao");
    const funcB = await pessoa("Funcionário B", B, "funcionario", { responsavel_fila: true });
    const naFila = await pessoa("Cliente Na Fila", A, "cliente");
    const parado = await pessoa("Cliente Parado", A, "cliente");
    const agenda = await pessoa("Cliente Agenda", A, "cliente");
    const orcam = await pessoa("Cliente Orçamento", A, "cliente");
    const plano = await pessoa("Cliente Plano", A, "cliente");
    const deB = await pessoa("Cliente da B", B, "cliente");
    const servA = await criar("servicos", { empresa: A.id, nome: "Lavagem", preco: 50, duracao_media_min: 30, ativo: true });
    const servB = await criar("servicos", { empresa: B.id, nome: "Lavagem", preco: 50, duracao_media_min: 30, ativo: true });
    const vFila = await carro(naFila, "HB20", "P01");
    const vParado = await carro(parado, "Onix", "P02");
    const vAg1 = await carro(agenda, "Gol", "P03");
    const vAg2 = await carro(agenda, "Polo", "P04");
    const vOrc = await carro(orcam, "Corolla", "P05");
    const vPlano = await carro(plano, "Civic", "P06");
    const vB = await carro(deB, "Argo", "P07");
    const clientesA = [naFila, parado, agenda, orcam, plano];
    const equipeA = [patrao, gerente, resp, func, comLista];

    console.log("\nAntes de qualquer atendimento");
    for (const [quem, rotulo] of [[func, "funcionário"], [gerente, "gerente sem 'Lista de clientes'"], [resp, "responsável pela fila"]]) {
      const vistos = await pessoasQueVe(quem);
      checar(`${rotulo} não lista nenhum cliente`, !clientesA.some((c) => vistos.includes(c.id)), vistos.length);
      checar(`${rotulo} não lista nenhum carro de cliente`, (await carrosQueVe(quem)).length === 0);
      checar(`${rotulo} continua vendo a equipe da empresa`, equipeA.every((p) => vistos.includes(p.id)));
    }
    for (const [quem, rotulo] of [[patrao, "dono"], [comLista, "funcionário com 'Lista de clientes'"]]) {
      const vistos = await pessoasQueVe(quem);
      checar(`${rotulo} vê todos os clientes da empresa`, clientesA.every((c) => vistos.includes(c.id)), vistos.length);
      const carros = await carrosQueVe(quem);
      checar(`${rotulo} vê todos os carros dos clientes`, [vFila, vParado, vAg1, vAg2, vOrc, vPlano].every((v) => carros.includes(v.id)), carros.length);
    }
    const vistosCliente = await pessoasQueVe(parado);
    checar("cliente só vê a si mesmo", vistosCliente.length === 1 && vistosCliente[0] === parado.id, vistosCliente);
    checar("cliente só vê os próprios carros", JSON.stringify(await carrosQueVe(parado)) === JSON.stringify([vParado.id]));
    checar("dono da outra empresa não vê clientes nem equipe da A", !(await pessoasQueVe(patraoB)).some((x) => [...clientesA, ...equipeA].map((p) => p.id).includes(x)));
    checar("dono da A não vê o cliente da B", !(await ve(patrao, deB)) && !(await veCarro(patrao, vB)));

    console.log("\nCliente na fila: a equipe vê nome e carro");
    let r = await api("POST", "/api/lr/fila/entrar", { token: naFila.token, body: { slug: A.slug, servico: servA.id, veiculos: [vFila.id] } });
    const entrada = r.data?.ids?.[0];
    checar("cliente entra na fila", r.status === 201 && entrada, r.data);
    checar("funcionário vê o cliente que está na fila", await ve(func, naFila));
    checar("funcionário vê o carro que está na fila", await veCarro(func, vFila));
    checar("mas não vê quem não está sendo atendido", !(await ve(func, parado)) && !(await veCarro(func, vParado)));
    r = await api("GET", `/api/collections/fila_entradas/records/${entrada}?expand=cliente,veiculo`, { token: func.token });
    checar("na fila da equipe o nome e o carro aparecem (expand)", r.data?.expand?.cliente?.nome === naFila.nome && r.data?.expand?.veiculo?.modelo === "HB20", r.data?.expand);
    checar("equipe da outra empresa não vê o cliente da fila da A", !(await ve(funcB, naFila)) && !(await veCarro(funcB, vFila)));
    for (const acao of ["confirmar", "iniciar", "pronto", "finalizar"]) await api("POST", `/api/lr/fila/${entrada}/${acao}`, { token: resp.token, body: {} });
    const fin = (await api("GET", `/api/collections/fila_entradas/records/${entrada}`, { token: ADM })).data;
    checar("lavagem finalizada", fin.status === "finalizado", fin.status);
    checar("logo depois da baixa (mesmo dia) a equipe ainda vê o cliente para a venda", await ve(func, naFila));

    console.log("\nPedido de horário (com 2 carros)");
    r = await api("POST", "/api/lr/agendar", { token: agenda.token, body: { slug: A.slug, servico: servA.id, veiculos: [vAg1.id, vAg2.id], horario: new Date(Date.now() + 26 * 3600000).toISOString() } });
    const ag = r.data?.id;
    checar("cliente pede horário", r.status === 201, r.data);
    checar("com o pedido esperando, a equipe vê o cliente e os 2 carros", (await ve(func, agenda)) && (await veCarro(func, vAg1)) && (await veCarro(func, vAg2)));
    r = await api("GET", `/api/collections/agendamentos/records/${ag}?expand=cliente,veiculos`, { token: resp.token });
    checar("pedido de horário mostra nome e carros para quem responde", r.data?.expand?.cliente?.nome === agenda.nome && r.data?.expand?.veiculos?.length === 2, r.data?.expand);
    r = await api("POST", `/api/lr/agendamentos/${ag}/responder`, { token: resp.token, body: { como: "recusar", resposta: "Fechado nesse dia" } });
    checar("responsável recusa o pedido", r.status === 200, r.data);
    checar("pedido recusado: a equipe deixa de ver o cliente e os carros", !(await ve(func, agenda)) && !(await veCarro(func, vAg1)));

    console.log("\nOrçamento aberto");
    r = await api("POST", "/api/collections/orcamentos/records", { token: orcam.token, body: { empresa: A.id, cliente: orcam.id, veiculo: vOrc.id, servico: servA.id, descricao: "Polimento", status: "pedido" } });
    const orc = r.data?.id;
    checar("cliente pede orçamento", r.status === 200, r.data);
    checar("com o orçamento aberto, o gerente vê o cliente e o carro", (await ve(gerente, orcam)) && (await veCarro(gerente, vOrc)));
    r = await api("POST", `/api/lr/orcamentos/${orc}/cancelar`, { token: orcam.token, body: {} });
    checar("cliente cancela o orçamento", r.status === 200, r.data);
    checar("orçamento cancelado: o gerente deixa de ver o cliente", !(await ve(gerente, orcam)) && !(await veCarro(gerente, vOrc)));

    console.log("\nPlano pedido");
    const pl = (await api("POST", "/api/collections/planos/records", { token: patrao.token, body: { empresa: A.id, nome: "Mensal", preco: 100, validade_dias: 30, lavagens: 4, ativo: true } })).data;
    r = await api("POST", "/api/lr/planos/pedir", { token: plano.token, body: { plano: pl.id, veiculo: vPlano.id } });
    const ass = r.data?.id;
    checar("cliente pede o plano", r.status === 201, r.data);
    checar("com o plano pedido, o funcionário vê o cliente e o carro", (await ve(func, plano)) && (await veCarro(func, vPlano)));
    r = await api("POST", `/api/lr/planos/${ass}/decidir`, { token: patrao.token, body: { aprovar: false, motivo: "teste" } });
    checar("dono recusa o plano", r.status === 200, r.data);
    checar("plano recusado: o funcionário deixa de ver o cliente", !(await ve(func, plano)) && !(await veCarro(func, vPlano)));

    console.log("\nPermissão 'Lista de clientes' ligada e desligada pelo dono");
    const vinc = (await api("GET", `/api/collections/vinculos/records?filter=${qs(`usuario="${func.id}" && empresa="${A.id}"`)}`, { token: ADM })).data.items[0];
    r = await api("PATCH", `/api/collections/vinculos/records/${vinc.id}`, { token: patrao.token, body: { perm_clientes: true } });
    checar("dono libera 'Lista de clientes' para o funcionário", r.status === 200);
    checar("funcionário passa a ver todos os clientes", clientesA.every((c) => true) && (await ve(func, parado)) && (await veCarro(func, vParado)));
    await api("PATCH", `/api/collections/vinculos/records/${vinc.id}`, { token: patrao.token, body: { perm_clientes: false } });
    checar("dono tira a permissão: volta a não ver", !(await ve(func, parado)) && !(await veCarro(func, vParado)));
    checar("funcionário da B nunca vê clientes da A, nem com permissão na B", !(await pessoasQueVe(funcB)).some((x) => clientesA.map((c) => c.id).includes(x)));
    checar("cliente da B não aparece para o funcionário com lista da A", !(await ve(comLista, deB)));
    // Carro do cliente da B entrando na fila da B não abre nada na A.
    await api("POST", "/api/lr/fila/entrar", { token: deB.token, body: { slug: B.slug, servico: servB.id, veiculos: [vB.id] } });
    checar("cliente na fila da B: a equipe da A continua sem ver", !(await ve(func, deB)) && !(await veCarro(func, vB)));
    checar("e a equipe da B vê", (await ve(funcB, deB)) && (await veCarro(funcB, vB)));
  } catch (err) {
    falhas++;
    console.log("  ✘ erro inesperado: " + (err.stack || err));
  } finally {
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
  }
  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main();
