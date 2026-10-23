#!/usr/bin/env node
// Teste: sem limite de carros por cliente e tabela de tamanhos de cada lava rápido.
// Regras do Diego (23/10/2026): o cliente põe quantos carros quiser; o dono ajusta o tamanho dos modelos (vale só no lava rápido dele); "cobrar como" do cliente continua valendo por cima.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-tamanhos.mjs

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
    const u = await criar("usuarios", { nome, celular: "114" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345" });
    await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    return { id: u.id, token: await token(u) };
  };
  const ler = async (col, id) => (await api("GET", `/api/collections/${col}/records/${id}`, { token: ADM })).data;

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Teste Tamanhos A", slug: "teste-tam-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const B = await criar("empresas", { nome: "Teste Tamanhos B", slug: "teste-tamb-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const patrao = await pessoa("Dono A", A, "patrao");
    const gerente = await pessoa("Gerente A", A, "gerente");
    const func = await pessoa("Funcionário A", A, "funcionario", { responsavel_fila: true });
    const patraoB = await pessoa("Dono B", B, "patrao");
    const c1 = await pessoa("Cliente Frota", A, "cliente");
    await criar("vinculos", { usuario: c1.id, empresa: B.id, papel: "cliente", ativo: true });

    // Mesmos tipos e preços nas duas empresas: pequeno 40, médio 60, grande 80 (sem tipo: 50).
    const montar = async (emp, dono) => {
      const r = await api("PATCH", `/api/collections/empresas/records/${emp.id}`, {
        token: dono.token,
        body: { tipos_veiculo: [{ nome: "Pequeno", vale: "pequeno" }, { nome: "Médio", vale: "medio" }, { nome: "Grande", vale: "grande" }] },
      });
      const t = Object.fromEntries(r.data.tipos_veiculo.map((x) => [x.vale, x.id]));
      const s = await criar("servicos", { empresa: emp.id, nome: "Lavagem", preco: 50, duracao_media_min: 30, ativo: true });
      await api("PATCH", `/api/collections/servicos/records/${s.id}`, { token: dono.token, body: { precos_tipo: { [t.pequeno]: 40, [t.medio]: 60, [t.grande]: 80 } } });
      return { tipos: t, servico: s };
    };
    const a = await montar(A, patrao);
    const b = await montar(B, patraoB);

    // Carros criados pelo próprio cliente: o servidor grava o tamanho pelo modelo.
    const carro = async (modelo, placa) => (await api("POST", "/api/collections/veiculos/records", { token: c1.token, body: { cliente: c1.id, final_placa: placa, modelo, cor: "Prata", ativo: true } })).data;
    const hb20 = await carro("HB20", "T01");
    const hilux = await carro("Hilux SRV", "T02");
    const strada = await carro("Strada Adventure", "T03");
    const corolla = await carro("Corolla XEi", "T04");
    const gol = await carro("Gol", "T05");
    const onix = await carro("Onix", "T06");
    checar("tamanho gravado pelo modelo (Hilux grande, Strada fora da lista)", hilux.porte === "grande" && strada.porte === "", [hilux.porte, strada.porte]);

    const entrar = async (emp, srv, carros) => api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: emp.slug, servico: srv.id, veiculos: carros.map((c) => c.id) } });
    const precos = async (ids) => Promise.all(ids.map(async (id) => (await ler("fila_entradas", id)).preco_servico));
    const sairTodos = async (ids) => {
      for (const id of ids) await api("POST", `/api/lr/fila/${id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    };

    console.log("\nSem limite de carros por cliente");
    let r = await entrar(A, a.servico, [hb20, hilux, strada, corolla, gol, onix]);
    checar("cliente põe 6 carros na fila de uma vez", r.status === 201 && r.data.ids?.length === 6, r.data);
    let ids = r.data?.ids || [];
    checar("cada carro com o seu preço pelo tamanho (40, 80, 50, 60, 40, 40)", JSON.stringify(await precos(ids)) === JSON.stringify([40, 80, 50, 60, 40, 40]), await precos(ids));
    const extra = await carro("Polo", "T07");
    r = await entrar(A, a.servico, [extra]);
    checar("e ainda pode pôr o 7º carro depois", r.status === 201, r.data);
    ids = ids.concat(r.data?.ids || []);
    r = await entrar(A, a.servico, [hb20]);
    checar("o mesmo carro continua não entrando duas vezes", r.status === 400 && /já está na fila/.test(r.data?.message || ""), r.data);
    await sairTodos(ids);

    console.log("\nTabela de tamanhos do lava rápido (só o dono)");
    let m = await api("GET", `/api/lr/modelos?empresa=${A.id}`);
    checar("lista do lava rápido sem ajustes = lista geral", m.status === 200 && Array.isArray(m.data) && !m.data.some((x) => x.ajustado));
    for (const [quem, t] of [["gerente", gerente.token], ["funcionário", func.token], ["cliente", c1.token], ["dono de outro lava rápido", patraoB.token]]) {
      r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: t, body: { tamanhos_modelos: { Hilux: "pequeno" } } });
      checar(`${quem} não muda a tabela de tamanhos`, negado(r), r.status);
    }
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { tamanhos_modelos: { Hilux: "enorme" } } });
    checar("tamanho que não existe é recusado", r.status === 400, r.data);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { tamanhos_modelos: { X: "medio" } } });
    checar("nome de modelo curto demais é recusado", r.status === 400, r.data);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { tamanhos_modelos: { Hilux: "medio", "  Strada  ": "medio" } } });
    checar("dono ajusta: Hilux médio e inclui a Strada como média", r.status === 200 && r.data.tamanhos_modelos?.Hilux === "medio" && r.data.tamanhos_modelos?.Strada === "medio", r.data);
    m = await api("GET", `/api/lr/modelos?empresa=${A.id}`);
    const mh = m.data.find((x) => x.nome === "Hilux");
    const ms = m.data.find((x) => x.nome === "Strada");
    checar("lista do lava rápido mostra o ajuste e o tamanho padrão", mh?.porte === "medio" && mh.ajustado && mh.padrao === "grande", mh);
    checar("modelo incluído pelo dono aparece na lista", ms?.porte === "medio" && ms.ajustado && ms.padrao === "", ms);
    m = await api("GET", `/api/lr/modelos?empresa=${B.id}`);
    checar("o outro lava rápido continua com a lista geral", m.data.find((x) => x.nome === "Hilux")?.porte === "grande" && !m.data.some((x) => x.ajustado));
    const auditoria = await api("GET", `/api/collections/auditoria/records?filter=${qs(`empresa = "${A.id}" && acao = "empresa_configurar"`)}`, { token: ADM });
    checar("mudança na tabela fica na auditoria", (auditoria.data?.items || []).some((x) => JSON.stringify(x.depois || {}).includes("Strada")), (auditoria.data?.items || []).map((x) => x.depois?.tamanhos_modelos));

    console.log("\nPreço usa a tabela do lava rápido");
    r = await entrar(A, a.servico, [hilux, strada]);
    ids = r.data?.ids || [];
    checar("neste lava rápido: Hilux e Strada cobradas como médio (60 e 60)", JSON.stringify(await precos(ids)) === "[60,60]", await precos(ids));
    await sairTodos(ids);
    r = await entrar(B, b.servico, [hilux, strada]);
    ids = r.data?.ids || [];
    checar("no outro lava rápido nada muda (Hilux 80, Strada sem tipo 50)", JSON.stringify(await precos(ids)) === "[80,50]", await precos(ids));
    await sairTodos(ids);
    checar("o cadastro do carro do cliente não muda", (await ler("veiculos", hilux.id)).porte === "grande");

    console.log("\n\"Cobrar como\" do cliente vale por cima da tabela");
    r = await api("POST", "/api/lr/cliente-tipo", { token: patrao.token, body: { empresa: A.id, veiculo: hilux.id, tipo: a.tipos.pequeno } });
    checar("dono grava: a Hilux deste cliente é cobrada como pequeno", r.status === 200, r.data);
    r = await entrar(A, a.servico, [hilux]);
    ids = r.data?.ids || [];
    checar("preço do cliente especial: 40", JSON.stringify(await precos(ids)) === "[40]", await precos(ids));
    await sairTodos(ids);
    await api("POST", "/api/lr/cliente-tipo", { token: patrao.token, body: { empresa: A.id, veiculo: hilux.id, tipo: "" } });

    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { tamanhos_modelos: { Strada: "medio" } } });
    checar("dono volta a Hilux ao padrão", r.status === 200 && !("Hilux" in (r.data.tamanhos_modelos || {})), r.data);
    r = await entrar(A, a.servico, [hilux]);
    ids = r.data?.ids || [];
    checar("Hilux volta a ser cobrada como grande (80)", JSON.stringify(await precos(ids)) === "[80]", await precos(ids));
    await sairTodos(ids);

    console.log("\nCaminhão e transporte (van, micro-ônibus, ônibus)");
    const atego = await carro("Atego 2426", "T08");
    const sprinter = await carro("Sprinter 415", "T09");
    const onibus = await carro("Volare W9", "T10");
    checar("tamanho pelo modelo: Atego caminhão, Sprinter e Volare transporte", atego.porte === "caminhao" && sprinter.porte === "transporte" && onibus.porte === "transporte", [atego.porte, sprinter.porte, onibus.porte]);
    r = await entrar(A, a.servico, [atego, sprinter]);
    ids = r.data?.ids || [];
    checar("sem preço próprio: caminhão e van cobrados como carro grande (80 e 80)", JSON.stringify(await precos(ids)) === "[80,80]", await precos(ids));
    await sairTodos(ids);
    const emp = await ler("empresas", A.id);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, {
      token: patrao.token,
      body: { tipos_veiculo: [...emp.tipos_veiculo, { nome: "Caminhão", vale: "caminhao" }, { nome: "Van / ônibus", vale: "transporte" }] },
    });
    const tc = r.data?.tipos_veiculo?.find((t) => t.vale === "caminhao");
    const tt = r.data?.tipos_veiculo?.find((t) => t.vale === "transporte");
    checar("dono cria os tipos Caminhão e Transporte", r.status === 200 && tc && tt, r.data);
    await api("PATCH", `/api/collections/servicos/records/${a.servico.id}`, { token: patrao.token, body: { precos_tipo: { [a.tipos.pequeno]: 40, [a.tipos.medio]: 60, [a.tipos.grande]: 80, [tc.id]: 200, [tt.id]: 120 } } });
    r = await entrar(A, a.servico, [atego, sprinter, onibus]);
    ids = r.data?.ids || [];
    checar("com preço próprio: caminhão 200, van 120, micro-ônibus 120", JSON.stringify(await precos(ids)) === "[200,120,120]", await precos(ids));
    await sairTodos(ids);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { tamanhos_modelos: { Strada: "medio", Daily: "caminhao" } } });
    checar("dono pode marcar um modelo como caminhão (Daily chassi)", r.status === 200 && r.data.tamanhos_modelos?.Daily === "caminhao", r.data);
    const daily = await carro("Daily 35-150", "T11");
    r = await entrar(A, a.servico, [daily]);
    ids = r.data?.ids || [];
    checar("a Daily deste lava rápido é cobrada como caminhão (200)", JSON.stringify(await precos(ids)) === "[200]", await precos(ids));
    await sairTodos(ids);
    r = await entrar(B, b.servico, [daily, atego]);
    ids = r.data?.ids || [];
    checar("no outro lava rápido (sem tipos novos): Daily e Atego como carro grande (80 e 80)", JSON.stringify(await precos(ids)) === "[80,80]", await precos(ids));
    await sairTodos(ids);

    console.log("\nAgendamento com vários carros");
    const amanha = new Date(Date.now() + 26 * 3600000);
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: a.servico.id, veiculos: [hb20.id, hilux.id, strada.id, corolla.id], horario: amanha.toISOString() } });
    checar("cliente pede horário para 4 carros", r.status === 201, r.data);
    const ag = r.data?.id;
    r = await api("POST", `/api/lr/agendamentos/${ag}/responder`, { token: patrao.token, body: { como: "na_fila", resposta: "" } });
    checar("dono põe os 4 na sequência da fila", r.status === 200, r.data);
    const naFila = await api("GET", `/api/collections/fila_entradas/records?filter=${qs(`empresa = "${A.id}" && cliente = "${c1.id}" && status != "cancelado"`)}`, { token: ADM });
    checar("os 4 carros estão na fila", naFila.data?.totalItems === 4, naFila.data?.totalItems);
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
