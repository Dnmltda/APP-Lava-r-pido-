#!/usr/bin/env node
// Teste da Etapa 2: fila (entrar, visão pública, confirmar/recusar, estados, baixa)
// com permissões por perfil e isolamento entre empresas.
// Roda contra um PocketBase de DESENVOLVIMENTO (cria e apaga dados "teste-*").
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-fila.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;

async function api(method, path, { token, body } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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
const minutos = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 60000);

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
      nome, celular: "118" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 900 } });
    return { usuario: u, vinculo: v, token: t.data.token };
  };
  const acao = (p, entrada, nome, body) => api("POST", `/api/lr/fila/${entrada}/${nome}`, { token: p.token, body });

  try {
    console.log("Preparando dados de teste…");
    const A = await criar("empresas", { nome: "Teste Fila A", slug: "teste-fa-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const B = await criar("empresas", { nome: "Teste Fila B", slug: "teste-fb-" + sufixo, ativo: true });
    const patraoA = await pessoa("Patrão A", A, "patrao");
    const gerenteA = await pessoa("Gerente A", A, "gerente");
    const funcA = await pessoa("Funcionário A", A, "funcionario");
    const respA = await pessoa("Responsável A", A, "funcionario", { responsavel_fila: true });
    const c1 = await pessoa("Ana Cliente", A, "cliente");
    const c2 = await pessoa("Bruno Cliente", A, "cliente");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const funcB = await pessoa("Funcionário B", B, "funcionario");

    // ------------------------------------------------------------ serviços
    console.log("\nServiços");
    let r = await api("POST", "/api/collections/servicos/records", {
      token: patraoA.token, body: { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true },
    });
    checar("patrão cria serviço", r.status === 200, r.data);
    const simples = r.data;
    r = await api("POST", "/api/collections/servicos/records", {
      token: patraoA.token, body: { empresa: A.id, nome: "Completa", preco: 90, duracao_media_min: 60, ativo: true },
    });
    const completa = r.data;
    r = await api("POST", "/api/collections/servicos/records", {
      token: patraoA.token, body: { empresa: A.id, nome: "Desativado", preco: 1, duracao_media_min: 10, ativo: false },
    });
    const desativado = r.data;
    r = await api("POST", "/api/collections/servicos/records", {
      token: gerenteA.token, body: { empresa: A.id, nome: "X", preco: 1, duracao_media_min: 10, ativo: true },
    });
    checar("gerente não cria serviço", negado(r), r.status);
    r = await api("POST", "/api/collections/servicos/records", {
      token: patraoA.token, body: { empresa: B.id, nome: "X", preco: 1, duracao_media_min: 10, ativo: true },
    });
    checar("patrão A não cria serviço na B", negado(r), r.status);
    r = await api("POST", "/api/collections/servicos/records", {
      token: patraoB.token, body: { empresa: B.id, nome: "Serviço B", preco: 50, duracao_media_min: 40, ativo: true },
    });
    const servicoB = r.data;
    r = await api("PATCH", `/api/collections/servicos/records/${simples.id}`, { token: patraoB.token, body: { preco: 0 } });
    checar("patrão B não edita serviço da A", negado(r), r.status);
    r = await api("GET", `/api/collections/servicos/records?perPage=200&filter=${encodeURIComponent(`empresa="${A.id}"`)}`);
    checar("visitante vê só serviços ativos", r.data.items.length === 2 && !r.data.items.some((s) => s.id === desativado.id), r.data.items.map((s) => s.nome));

    // ------------------------------------------------------------ veículos
    console.log("\nVeículos");
    r = await api("POST", "/api/collections/veiculos/records", {
      token: c1.token, body: { cliente: c1.usuario.id, placa: "abc-1d23", modelo: "Onix", cor: "Prata" },
    });
    checar("cliente cadastra veículo (placa normalizada, final calculado)", r.status === 200 && r.data.placa === "ABC1D23" && r.data.final_placa === "D23" && r.data.ativo === true, r.data);
    const v1 = r.data;
    r = await api("POST", "/api/collections/veiculos/records", { token: c2.token, body: { cliente: c2.usuario.id, final_placa: "456", modelo: "Gol" } });
    checar("veículo só com os 3 últimos", r.status === 200 && r.data.final_placa === "456", r.data);
    const v2 = r.data;
    r = await api("POST", "/api/collections/veiculos/records", { token: c1.token, body: { cliente: c2.usuario.id, final_placa: "999" } });
    checar("não cadastra veículo para outra pessoa", negado(r), r.status);
    r = await api("GET", "/api/collections/veiculos/records", { token: c2.token });
    checar("cliente vê só os próprios veículos", r.data.items.every((v) => v.cliente === c2.usuario.id), r.data.items.length);
    r = await api("GET", `/api/collections/veiculos/records/${v1.id}`, { token: funcA.token });
    checar("equipe A vê veículo de cliente da A", r.status === 200, r.status);
    r = await api("GET", `/api/collections/veiculos/records/${v1.id}`, { token: funcB.token });
    checar("equipe B não vê veículo de cliente só da A", r.status === 404, r.status);

    // ------------------------------------------------------- entrar na fila
    console.log("\nEntrar na fila");
    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: simples.id, veiculo: v1.id, quer_busca: true } });
    checar("cliente entra na fila (pendente)", r.status === 201, r.data);
    const e1 = r.data.id;
    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: simples.id, veiculo: v1.id } });
    checar("não entra duas vezes na mesma empresa", r.status === 400, r.data);
    r = await api("POST", "/api/lr/fila/entrar", { token: c2.token, body: { slug: A.slug, servico: servicoB.id, veiculo: v2.id } });
    checar("não usa serviço de outra empresa", r.status === 400, r.status);
    r = await api("POST", "/api/lr/fila/entrar", { token: c2.token, body: { slug: A.slug, servico: desativado.id, veiculo: v2.id } });
    checar("não usa serviço desativado", r.status === 400, r.status);
    r = await api("POST", "/api/lr/fila/entrar", { token: c2.token, body: { slug: A.slug, servico: completa.id, veiculo: v1.id } });
    checar("não usa veículo de outra pessoa", r.status === 400, r.status);
    r = await api("POST", "/api/lr/fila/entrar", { token: c2.token, body: { slug: A.slug, servico: completa.id, veiculo: v2.id } });
    checar("segundo cliente entra", r.status === 201, r.data);
    const e2 = r.data.id;
    r = await api("POST", "/api/collections/fila_entradas/records", {
      token: patraoA.token, body: { empresa: A.id, servico: simples.id, origem: "app", ordem: 0, status: "lavando" },
    });
    checar("ninguém cria entrada direto pela API (nem o patrão)", negado(r), r.status);
    r = await api("PATCH", `/api/collections/fila_entradas/records/${e1}`, { token: patraoA.token, body: { ordem: 99 } });
    checar("ninguém altera a entrada direto pela API", negado(r), r.status);

    // ------------------------------------------------------- visão pública
    console.log("\nFila pública");
    r = await api("GET", `/api/lr/fila-publica/${A.slug}`);
    const texto = JSON.stringify(r.data);
    checar("visitante vê a fila", r.status === 200 && r.data.fila.length === 2, r.data);
    checar("só primeiro nome e 3 últimos da placa", r.data.fila[0].nome === "Ana" && r.data.fila[0].final_placa === "D23", r.data.fila[0]);
    checar("sem celular, placa completa ou sobrenome", !texto.includes(c1.usuario.celular) && !texto.includes("ABC1D23") && !texto.includes("Cliente"), texto);
    checar("ordem de entrada mantida", r.data.fila[0].id === e1 && r.data.fila[1].id === e2 && r.data.fila[0].posicao === 1);
    r = await api("GET", `/api/lr/fila-publica/${A.slug}`, { token: c2.token });
    checar("cliente vê a própria entrada marcada", r.data.fila.find((f) => f.id === e2)?.minha === true && r.data.fila.find((f) => f.id === e1)?.minha === false);

    // ------------------------------------------------------------ leitura
    console.log("\nQuem vê o quê");
    r = await api("GET", "/api/collections/fila_entradas/records", { token: c1.token });
    checar("cliente vê só a própria entrada completa", r.data.items.length === 1 && r.data.items[0].id === e1, r.data.items.length);
    r = await api("GET", "/api/collections/fila_entradas/records", { token: funcA.token });
    checar("funcionário A vê a fila completa da A", r.data.items.length === 2, r.data.items.length);
    r = await api("GET", "/api/collections/fila_entradas/records", { token: funcB.token });
    checar("funcionário B não vê a fila da A", r.data.items.length === 0, r.data.items.length);

    // --------------------------------------------------- confirmar/recusar
    console.log("\nConfirmar e recusar");
    r = await acao(funcA, e1, "confirmar");
    checar("funcionário comum não confirma", r.status === 403, r.status);
    r = await acao(c1, e1, "confirmar");
    checar("cliente não confirma a própria entrada", r.status === 403, r.status);
    r = await acao(patraoB, e1, "confirmar");
    checar("patrão B não mexe na fila da A", r.status === 404, r.status);
    r = await acao(respA, e1, "confirmar");
    checar("responsável pela fila confirma", r.status === 200 && r.data.status === "confirmado", r.data);
    r = await acao(gerenteA, e1, "confirmar");
    checar("não confirma duas vezes", r.status === 400, r.status);
    r = await acao(gerenteA, e2, "confirmar");
    checar("gerente confirma", r.status === 200, r.data);

    // ------------------------------------------------------------- balcão
    console.log("\nCliente de balcão e previsão (2 carros ao mesmo tempo)");
    r = await api("POST", "/api/lr/fila/balcao", {
      token: funcA.token, body: { empresa: A.id, servico: simples.id, nome: "Carlos", final_placa: "789" },
    });
    checar("funcionário comum não lança balcão", r.status === 403, r.status);
    r = await api("POST", "/api/lr/fila/balcao", {
      token: respA.token, body: { empresa: A.id, servico: simples.id, nome: "Carlos Balcão", final_placa: "x-789" },
    });
    checar("responsável lança cliente de balcão (já confirmado, no fim)", r.status === 201, r.data);
    const e3 = r.data.id;
    r = await api("GET", `/api/lr/fila-publica/${A.slug}`);
    const [p1, p2, p3] = r.data.fila;
    checar("balcão entra no fim da fila", p3?.id === e3 && p3?.posicao === 3, r.data.fila.map((f) => f.id));
    checar("1º e 2º começam agora (2 vagas)", minutos(p1.previsao, r.data.agora) === 0 && minutos(p2.previsao, r.data.agora) === 0, [p1.previsao, p2.previsao]);
    checar("3º começa quando a vaga do serviço de 30 min liberar", minutos(p3.previsao, r.data.agora) === 30, minutos(p3.previsao, r.data.agora));

    // ------------------------------------------------------- lavar e dar baixa
    console.log("\nLavar e dar baixa");
    r = await acao(c1, e1, "iniciar");
    checar("cliente não inicia lavagem", r.status === 403, r.status);
    r = await acao(funcA, e1, "chegou");
    checar("funcionário marca que o cliente chegou", r.status === 200 && r.data.status === "no_local", r.data);
    r = await acao(funcA, e1, "iniciar");
    checar("funcionário inicia a lavagem", r.status === 200 && r.data.status === "lavando", r.data);
    r = await api("GET", `/api/lr/fila-publica/${A.slug}`);
    checar("carro lavando sai da fila e vai para 'lavando'", r.data.lavando.length === 1 && r.data.fila.length === 2 && r.data.fila[0].posicao === 1, r.data);
    r = await acao(funcA, e1, "pronto");
    checar("marca pronto", r.status === 200 && r.data.status === "pronto", r.data);
    r = await acao(funcA, e1, "finalizar", { lavado_por: funcB.usuario.id });
    checar("não registra lavador de outra empresa", r.status === 400, r.status);
    r = await acao(funcA, e1, "finalizar", { lavado_por: gerenteA.usuario.id });
    checar("dá baixa registrando quem lavou", r.status === 200 && r.data.status === "finalizado", r.data);
    r = await api("GET", `/api/collections/fila_entradas/records/${e1}`, { token: patraoA.token });
    checar("baixa grava lavado_por, quem deu a baixa e horário", r.data.lavado_por === gerenteA.usuario.id && r.data.finalizado_por === funcA.usuario.id && !!r.data.finalizado_em, r.data);
    r = await acao(c1, e1, "cancelar");
    checar("não cancela carro já finalizado", r.status === 400, r.status);

    // ------------------------------------------------------------- cancelar
    console.log("\nCancelar e recusar");
    r = await acao(c1, e2, "cancelar");
    checar("cliente não cancela a entrada de outro", r.status === 404, r.status);
    r = await acao(c2, e2, "cancelar");
    checar("cliente cancela a própria entrada", r.status === 200 && r.data.status === "cancelado", r.data);
    r = await api("GET", `/api/lr/fila-publica/${A.slug}`);
    checar("vaga some e quem estava atrás sobe", r.data.fila.length === 1 && r.data.fila[0].id === e3 && r.data.fila[0].posicao === 1, r.data.fila);
    r = await api("POST", "/api/lr/fila/entrar", { token: c2.token, body: { slug: A.slug, servico: simples.id, veiculo: v2.id } });
    checar("depois de cancelar, pode entrar de novo (no fim)", r.status === 201, r.data);
    const e4 = r.data.id;
    r = await acao(funcA, e4, "recusar");
    checar("funcionário comum não recusa", r.status === 403, r.status);
    r = await acao(patraoA, e4, "recusar", { motivo: "Fechando mais cedo" });
    checar("patrão recusa com motivo", r.status === 200 && r.data.status === "recusado", r.data);

    // ------------------------------------------------------------ auditoria
    console.log("\nAuditoria e tempo real");
    r = await api("GET", `/api/collections/auditoria/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: patraoA.token });
    const acoes = r.data.items.map((a) => a.acao);
    checar("ações da fila registradas", ["fila_confirmar", "fila_balcao", "fila_iniciar", "fila_finalizar", "fila_cancelar", "fila_recusar"].every((a) => acoes.includes(a)), acoes);
    r = await api("GET", `/api/collections/fila_sinais/records?filter=${encodeURIComponent(`empresa="${A.id}"`)}`);
    checar("sinal de tempo real público e atualizado", r.data.items.length === 1 && r.data.items[0].versao >= 10, r.data.items);
    r = await api("PATCH", `/api/collections/fila_sinais/records/${r.data.items[0].id}`, { token: patraoA.token, body: { versao: 0 } });
    checar("ninguém altera o sinal pela API", negado(r), r.status);

    // ------------------------------------------------------------ limpeza
    console.log("\nLimpando dados de teste…");
    const aud = await api("GET", `/api/collections/auditoria/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
    for (const a of aud.data.items) await api("DELETE", `/api/collections/auditoria/records/${a.id}`, { token: ADM });
    const fila = await api("GET", `/api/collections/fila_entradas/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
    for (const f of fila.data.items) await api("DELETE", `/api/collections/fila_entradas/records/${f.id}`, { token: ADM });
  } finally {
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
  }

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
