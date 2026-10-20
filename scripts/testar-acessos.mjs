#!/usr/bin/env node
// Teste dos acessos que o DONO libera por pessoa e da lista de clientes.
//   - padrão: lista de clientes só do dono; gerente mantém o que já tinha;
//   - o dono libera/tira: clientes, valores, câmeras (só ver), serviços/preços/produtos;
//   - ninguém além do dono consegue liberar acesso (nem para si mesmo);
//   - cliente nunca guarda acesso; promover funcionário a gerente continua funcionando.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-acessos.mjs

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
async function api(method, path, { token, body } = {}, tentativa = 0) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && tentativa < 15) {
    await new Promise((r) => setTimeout(r, 5000));
    return api(method, path, { token, body }, tentativa + 1);
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
    const u = await criar("usuarios", { nome, celular: "112" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345" });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token, id: u.id };
  };

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Acessos", slug: "teste-ace-" + sufixo, ativo: true });
    const B = await criar("empresas", { nome: "Teste Acessos B", slug: "teste-aceb-" + sufixo, ativo: true });
    const patrao = await pessoa("Dono", A, "patrao");
    const gerente = await pessoa("Gerente", A, "gerente");
    const func = await pessoa("Funcionário", A, "funcionario");
    const func2 = await pessoa("Funcionário Dois", A, "funcionario");
    const c1 = await pessoa("Cliente Fiel", A, "cliente");
    const c2 = await pessoa("Cliente Novo", A, "cliente");
    const patraoB = await pessoa("Dono B", B, "patrao");
    const servico = await criar("servicos", { empresa: A.id, nome: "Completa", preco: 60, duracao_media_min: 40, ativo: true });
    const produto = await criar("produtos", { empresa: A.id, nome: "Cera", preco: 20, estoque: 50, estoque_minimo: 1, comissao_tipo: "nenhuma", ativo: true });
    const veic = await criar("veiculos", { cliente: c1.id, placa: "FIE1L23", final_placa: "L23", modelo: "Gol", cor: "Branco", ativo: true });
    // Uma visita do Cliente Fiel com venda de produto
    let r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: servico.id, veiculo: veic.id } });
    const ent = r.data.id;
    await api("POST", `/api/lr/fila/${ent}/confirmar`, { token: patrao.token });
    await api("POST", `/api/lr/fila/${ent}/iniciar`, { token: func.token });
    await api("POST", `/api/lr/fila/${ent}/finalizar`, { token: func.token, body: { lavado_por: func.id } });
    await api("POST", "/api/lr/vendas", { token: gerente.token, body: { empresa: A.id, entrada: ent, itens: [{ produto: produto.id, quantidade: 2 }], forma_pagamento: "pix", fechar: true } });
    await api("POST", "/api/lr/avaliar", { token: c1.token, body: { entrada: ent, nota_funcionario: 5, nota_atendimento: 5, nota_ambiente: 5 } });
    await api("POST", "/api/collections/lancamentos_caixa/records", { token: patrao.token, body: { empresa: A.id, data: new Date().toISOString(), tipo: "saida", categoria: "Água", valor: 30, criado_por: patrao.id } });
    await criar("cameras", { empresa: A.id, nome: "Box", tipo_integracao: "demonstracao", ativo: true });
    const liberar = (p, campos) => api("PATCH", `/api/collections/vinculos/records/${p.vinculo.id}`, { token: patrao.token, body: campos });

    console.log("\nLista de clientes (padrão: só o dono)");
    r = await api("GET", `/api/lr/clientes/${A.id}`, { token: patrao.token });
    const fiel = r.data && r.data.clientes.find((c) => c.usuario === c1.id);
    checar("dono vê a lista de clientes", r.status === 200 && r.data.total === 2, r.data && r.data.total);
    checar("lista traz visitas, última visita e gasto (serviço + produtos)", fiel && fiel.visitas === 1 && !!fiel.ultima_visita && fiel.gasto_total === 100, fiel);
    checar("lista traz o celular para chamar no WhatsApp", fiel && fiel.celular === c1.usuario.celular);
    await api("POST", "/api/lr/meu-contato", { token: c1.token, body: { email: "fiel@email.com", rede_social: "@fiel" } });
    r = await api("GET", `/api/lr/clientes/${A.id}/${c1.id}`, { token: patrao.token });
    checar("dono vê o e-mail e a rede social que o cliente informou", r.data?.email === "fiel@email.com" && r.data?.rede_social === "@fiel", r.data && [r.data.email, r.data.rede_social]);
    checar("dono abre o histórico do cliente com valores", r.status === 200 && r.data.gasto.total === 100 && r.data.visitas[0].valor === 100 && r.data.veiculos[0].placa === "FIE1L23", r.data);
    r = await api("GET", `/api/lr/clientes/${A.id}/${func.id}`, { token: patrao.token });
    checar("pessoa da equipe não aparece como cliente", r.status === 404, r.status);
    for (const [quem, p] of [["gerente", gerente], ["funcionário", func], ["cliente", c1], ["dono de outra empresa", patraoB]]) {
      r = await api("GET", `/api/lr/clientes/${A.id}`, { token: p.token });
      checar(`${quem} não vê a lista de clientes`, negado(r), r.status);
    }
    r = await api("GET", `/api/lr/clientes/${A.id}`);
    checar("sem login não vê", negado(r), r.status);

    console.log("\nO gerente mantém o que já tinha");
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: gerente.token });
    checar("gerente continua vendo o painel/valores", r.status === 200, r.status);
    r = await api("GET", `/api/collections/cameras/records?filter=${qs(`empresa="${A.id}"`)}`, { token: gerente.token });
    checar("gerente não vê câmeras por padrão", r.status === 200 && r.data.items.length === 0);
    r = await api("PATCH", `/api/collections/servicos/records/${servico.id}`, { token: gerente.token, body: { preco: 70 } });
    checar("gerente não muda preço por padrão", negado(r), r.status);
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func.token });
    checar("funcionário não vê valores por padrão", negado(r), r.status);

    console.log("\nNinguém além do dono libera acesso");
    r = await api("PATCH", `/api/collections/vinculos/records/${gerente.vinculo.id}`, { token: gerente.token, body: { perm_clientes: true } });
    checar("gerente não libera acesso para si mesmo", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${func.vinculo.id}`, { token: gerente.token, body: { perm_valores: true } });
    checar("gerente não libera acesso para funcionário", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${func.vinculo.id}`, { token: func.token, body: { perm_valores: true } });
    checar("funcionário não se libera", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${func.vinculo.id}`, { token: patraoB.token, body: { perm_valores: true } });
    checar("dono de outra empresa não libera", negado(r), r.status);

    console.log("\nDono libera: lista de clientes");
    r = await liberar(gerente, { perm_clientes: true });
    checar("dono libera a lista de clientes para o gerente", r.status === 200 && r.data.perm_clientes === true, r.data);
    r = await api("GET", `/api/lr/clientes/${A.id}`, { token: gerente.token });
    checar("gerente passa a ver a lista de clientes", r.status === 200 && r.data.total === 2, r.status);
    r = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: gerente.token });
    checar("com a lista liberada, vê o nome do cliente na avaliação", r.status === 200 && r.texto.includes("Cliente Fiel"), r.data);
    r = await api("GET", `/api/lr/clientes/${A.id}`, { token: func.token });
    checar("quem não recebeu continua sem ver", negado(r), r.status);

    console.log("\nDono libera: valores para um funcionário");
    await liberar(func, { perm_valores: true });
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func.token });
    checar("funcionário liberado vê o painel", r.status === 200, r.status);
    r = await api("GET", `/api/lr/relatorio/${A.id}`, { token: func.token });
    checar("funcionário liberado vê o dashboard", r.status === 200, r.status);
    r = await api("GET", `/api/collections/lancamentos_caixa/records?filter=${qs(`empresa="${A.id}"`)}`, { token: func.token });
    checar("funcionário liberado vê o caixa", r.status === 200 && r.data.items.length === 1, r.data && r.data.items && r.data.items.length);
    r = await api("GET", `/api/collections/vendas/records?filter=${qs(`empresa="${A.id}"`)}`, { token: func.token });
    checar("funcionário liberado vê as vendas de todos", r.status === 200 && r.data.items.some((v) => v.funcionario === gerente.id), r.data && r.data.items && r.data.items.length);
    r = await api("POST", "/api/collections/lancamentos_caixa/records", { token: func.token, body: { empresa: A.id, data: new Date().toISOString(), tipo: "saida", categoria: "X", valor: 1, criado_por: func.id } });
    checar("ver valores não deixa lançar no caixa (continua do dono)", negado(r), r.status);
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func2.token });
    checar("outro funcionário continua sem ver valores", negado(r), r.status);
    await liberar(func, { perm_valores: false });
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func.token });
    checar("dono tira o acesso e ele deixa de ver na hora", negado(r), r.status);

    console.log("\nDono libera: ver câmeras");
    await liberar(gerente, { perm_cameras: true });
    r = await api("GET", `/api/collections/cameras/records?filter=${qs(`empresa="${A.id}"`)}`, { token: gerente.token });
    const camG = r.data && r.data.items[0];
    checar("gerente liberado vê as câmeras", r.status === 200 && r.data.items.length === 1);
    checar("mas não vê a configuração (endereço, chave do sensor)", camG && !("chave_sensor" in camG) && !("endereco_stream" in camG) && !("gateway_token" in camG), camG);
    r = await api("POST", `/api/lr/cameras/${camG.id}/acesso`, { token: gerente.token });
    const passe = r.data && r.data.url;
    checar("gerente liberado recebe passe e vê a imagem", r.status === 200 && (await fetch(PB + passe)).status === 200, r.status);
    r = await api("POST", "/api/collections/cameras/records", { token: gerente.token, body: { empresa: A.id, nome: "X", tipo_integracao: "demonstracao", ativo: true } });
    checar("ver câmeras não deixa cadastrar câmera", negado(r), r.status);
    r = await api("PATCH", `/api/collections/cameras/records/${camG.id}`, { token: gerente.token, body: { nome: "Hack" } });
    checar("nem editar câmera", negado(r), r.status);
    r = await api("POST", `/api/lr/cameras/${camG.id}/nova-chave`, { token: gerente.token });
    checar("nem trocar a chave do sensor", negado(r), r.status);
    await liberar(gerente, { perm_cameras: false });
    checar("dono tira e o passe já emitido para de funcionar", (await fetch(PB + passe)).status === 403);

    console.log("\nDono libera: serviços, preços e produtos");
    await liberar(func2, { perm_catalogo: true });
    r = await api("PATCH", `/api/collections/servicos/records/${servico.id}`, { token: func2.token, body: { preco: 65 } });
    checar("funcionário liberado muda o preço do serviço", r.status === 200 && r.data.preco === 65, r.status);
    r = await api("POST", "/api/collections/produtos/records", { token: func2.token, body: { empresa: A.id, nome: "Novo", preco: 9, estoque: 3, estoque_minimo: 1, comissao_tipo: "nenhuma", ativo: true } });
    checar("e cadastra produto", r.status === 200, r.status);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: func2.token, body: { nome: "Hack" } });
    checar("mas não mexe nas configurações da empresa", negado(r), r.status);
    r = await api("POST", "/api/lr/equipe", { token: func2.token, body: { empresa: A.id, nome: "X", celular: "113" + sufixo + "90", senha: "boaSenha2026", papel: "funcionario" } });
    checar("nem cadastra pessoas na equipe", negado(r), r.status);
    r = await api("POST", "/api/collections/vales/records", { token: func2.token, body: { empresa: A.id, funcionario: func.id, valor: 10, data: new Date().toISOString(), lancado_por: func2.id } });
    checar("nem lança vale", negado(r), r.status);
    r = await api("POST", "/api/collections/servicos/records", { token: patraoB.token, body: { empresa: A.id, nome: "Hack", preco: 1, duracao_media_min: 10, ativo: true } });
    checar("dono de outra empresa não cria serviço aqui", negado(r), r.status);

    console.log("\nCliente nunca guarda acesso");
    r = await liberar(c2, { perm_clientes: true, perm_valores: true });
    const v2 = (await api("GET", `/api/collections/vinculos/records/${c2.vinculo.id}`, { token: ADM })).data;
    checar("acesso extra em cliente é ignorado", v2.perm_clientes === false && v2.perm_valores === false, v2);
    r = await api("GET", `/api/lr/clientes/${A.id}`, { token: c2.token });
    checar("cliente continua sem ver a lista", negado(r), r.status);

    console.log("\nPromover alguém");
    r = await liberar(func2, { papel: "gerente" });
    checar("dono promove funcionário a gerente", r.status === 200 && r.data.papel === "gerente", r.data);
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func2.token });
    checar("promovido passa a ter o que o gerente tem", r.status === 200, r.status);
    await liberar(func2, { papel: "funcionario", perm_catalogo: false });
    r = await api("GET", `/api/lr/painel/${A.id}`, { token: func2.token });
    checar("voltou a funcionário: perde o que era do gerente", negado(r), r.status);

    r = await api("GET", `/api/collections/auditoria/records?filter=${qs(`empresa="${A.id}" && acao="equipe_editar"`)}&perPage=100`, { token: ADM });
    checar("toda liberação fica no histórico (auditoria)", r.status === 200 && r.data.items.some((i) => JSON.stringify(i.depois).includes('"perm_clientes":true')), r.data && r.data.items.length);
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
