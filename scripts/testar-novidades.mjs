#!/usr/bin/env node
// Teste das melhorias pós-Etapa 8:
//   - cliente reserva produtos ENQUANTO está na fila (e tira o que ainda não foi separado);
//   - relatório / dashboard (patrão e gerente);
//   - sessão longa (login lembrado) e tempo real funcionando.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-novidades.mjs

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
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}
const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400;
const qs = encodeURIComponent;

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD } });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token: ADM, body });
    if (r.status !== 200) throw new Error(`Falha ao criar ${col}: ${JSON.stringify(r.data)}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  let seq = 0;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const celular = "113" + sufixo + String(seq++).padStart(2, "0");
    const u = await criar("usuarios", { nome, celular, password: "senha12345", passwordConfirm: "senha12345" });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token, id: u.id, celular };
  };

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Novidades", slug: "teste-nov-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const B = await criar("empresas", { nome: "Teste Novidades B", slug: "teste-novb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão", A, "patrao");
    const gerente = await pessoa("Gerente", A, "gerente");
    const func = await pessoa("Func", A, "funcionario");
    const c1 = await pessoa("Cliente Um", A, "cliente");
    const c2 = await pessoa("Cliente Dois", A, "cliente");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const servico = await criar("servicos", { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true });
    const pA = await criar("produtos", { empresa: A.id, nome: "Cheirinho", preco: 10, estoque: 50, estoque_minimo: 1, comissao_tipo: "nenhuma", ativo: true });
    const pB = await criar("produtos", { empresa: A.id, nome: "Pretinho", preco: 30, estoque: 50, estoque_minimo: 1, comissao_tipo: "nenhuma", ativo: true });
    const pInativo = await criar("produtos", { empresa: A.id, nome: "Antigo", preco: 5, estoque: 5, estoque_minimo: 1, comissao_tipo: "nenhuma", ativo: false });
    const pOutra = await criar("produtos", { empresa: B.id, nome: "De outra", preco: 5, estoque: 5, estoque_minimo: 1, comissao_tipo: "nenhuma", ativo: true });
    const v1 = await criar("veiculos", { cliente: c1.id, final_placa: "U01", ativo: true });

    console.log("\nCliente reserva produtos durante a fila");
    let r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: servico.id, veiculo: v1.id, itens: [{ produto: pA.id, quantidade: 1 }] } });
    const e1 = r.data.id;
    checar("entra na fila já com 1 produto (carrinho antes)", r.status === 201);
    const itens = async () => (await api("GET", `/api/collections/itens_pedido/records?filter=${qs(`entrada="${e1}"`)}&sort=created`, { token: ADM })).data.items;
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pB.id, quantidade: 2 }] } });
    let lista = await itens();
    checar("reserva outro produto depois de já estar na fila", r.status === 200 && lista.length === 2 && lista.some((i) => i.produto === pB.id && i.quantidade === 2), lista);
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pA.id, quantidade: 3 }] } });
    lista = await itens();
    checar("mesmo produto ainda não separado: soma a quantidade", r.status === 200 && lista.length === 2 && lista.find((i) => i.produto === pA.id).quantidade === 4, lista);
    checar("preço e nome guardados no pedido", lista.find((i) => i.produto === pB.id).preco_unitario === 30 && lista.find((i) => i.produto === pB.id).produto_nome === "Pretinho");
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pA.id, quantidade: 20 }] } });
    checar("não passa de 20 unidades do mesmo produto", r.status === 400, r.status);
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pInativo.id, quantidade: 1 }] } });
    checar("produto desativado é recusado", r.status === 400, r.status);
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pOutra.id, quantidade: 1 }] } });
    checar("produto de outro lava rápido é recusado", r.status === 400, r.status);
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [] } });
    checar("pedido vazio é recusado", r.status === 400, r.status);
    for (const [quem, p] of [["outro cliente", c2], ["funcionário", func], ["patrão de outra empresa", patraoB]]) {
      r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: p.token, body: { itens: [{ produto: pA.id, quantidade: 1 }] } });
      checar(`${quem} não reserva no carro dos outros`, negado(r), r.status);
    }
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { body: { itens: [{ produto: pA.id, quantidade: 1 }] } });
    checar("sem login não reserva", negado(r), r.status);

    r = await api("GET", `/api/collections/itens_pedido/records?filter=${qs(`entrada="${e1}"`)}`, { token: func.token });
    checar("equipe vê os produtos reservados para separar", r.status === 200 && r.data.items.length === 2, r.data && r.data.items.length);
    const itemA = lista.find((i) => i.produto === pA.id);
    const itemB = lista.find((i) => i.produto === pB.id);
    await api("POST", `/api/lr/itens/${itemA.id}/status`, { token: func.token, body: { status: "separado" } });
    r = await api("POST", `/api/lr/itens/${itemA.id}/remover`, { token: c1.token });
    checar("cliente não tira produto que a equipe já separou", r.status === 400, r.status);
    r = await api("POST", `/api/lr/itens/${itemB.id}/remover`, { token: c2.token });
    checar("outro cliente não tira produto do pedido", negado(r), r.status);
    r = await api("POST", `/api/lr/itens/${itemB.id}/remover`, { token: func.token });
    checar("funcionário não usa a rota do cliente para tirar produto", negado(r), r.status);
    r = await api("POST", `/api/lr/itens/${itemB.id}/remover`, { token: c1.token });
    checar("cliente tira produto ainda não separado", r.status === 204 && (await itens()).length === 1, r.status);
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pA.id, quantidade: 1 }] } });
    lista = await itens();
    checar("depois de separado, novo pedido do mesmo produto vira outra linha", r.status === 200 && lista.length === 2, lista.length);

    await api("POST", `/api/lr/fila/${e1}/confirmar`, { token: patrao.token });
    await api("POST", `/api/lr/fila/${e1}/iniciar`, { token: func.token });
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pB.id, quantidade: 1 }] } });
    checar("ainda pode reservar enquanto o carro está sendo lavado", r.status === 200, r.status);
    await api("POST", `/api/lr/fila/${e1}/finalizar`, { token: func.token, body: { lavado_por: func.id } });
    r = await api("POST", `/api/lr/fila/${e1}/produtos`, { token: c1.token, body: { itens: [{ produto: pB.id, quantidade: 1 }] } });
    checar("depois da baixa não reserva mais (pede no balcão)", r.status === 400, r.status);
    const ultimo = (await itens()).find((i) => i.status === "pendente");
    r = await api("POST", `/api/lr/itens/${ultimo.id}/remover`, { token: c1.token });
    checar("depois da baixa não tira produto", r.status === 400, r.status);

    console.log("\nDashboard / relatório");
    await api("POST", "/api/lr/vendas", { token: func.token, body: { empresa: A.id, entrada: e1, itens: [{ produto: pB.id, quantidade: 1 }], forma_pagamento: "pix", fechar: true } });
    r = await api("GET", `/api/lr/relatorio/${A.id}`, { token: patrao.token });
    const d = r.data;
    checar("patrão abre o relatório", r.status === 200, r.status);
    checar("padrão: últimos 7 dias, um ponto por dia", d && d.dias.length === 7, d && d.dias.length);
    checar("conta o carro lavado e o valor do serviço", d && d.resumo.carros === 1 && d.resumo.servicos === 40, d && d.resumo);
    checar("conta a venda de produto e a forma de pagamento", d && d.resumo.produtos === 30 && d.por_forma_pagamento.pix === 30, d && d.por_forma_pagamento);
    checar("faturamento = serviços + produtos e ticket médio", d && d.resumo.total === 70 && d.resumo.ticket_medio === 70, d && d.resumo);
    checar("série do dia de hoje bate com o total", d && d.dias[d.dias.length - 1].total === 70, d && d.dias.slice(-1));
    checar("horário de movimento tem 24 horas e soma 1 carro", d && d.horas.length === 24 && d.horas.reduce((s, h) => s + h.carros, 0) === 1);
    checar("serviços e equipe no relatório", d && d.servicos[0].nome === "Simples" && d.equipe.find((e) => e.usuario === func.id).carros === 1, d && d.equipe);
    checar("fila do período (entradas e atendidos)", d && d.fila.total === 1 && d.fila.finalizados === 1 && d.fila.app === 1, d && d.fila);
    checar("comparação com o período anterior vem junto", d && d.anterior && typeof d.anterior.total === "number");
    r = await api("GET", `/api/lr/relatorio/${A.id}`, { token: gerente.token });
    checar("gerente abre o relatório (acompanhar carros e rotina)", r.status === 200, r.status);
    for (const [quem, p] of [["funcionário", func], ["cliente", c1], ["patrão de outra empresa", patraoB]]) {
      r = await api("GET", `/api/lr/relatorio/${A.id}`, { token: p.token });
      checar(`${quem} não abre o relatório`, negado(r), r.status);
    }
    r = await api("GET", `/api/lr/relatorio/${A.id}`);
    checar("sem login não abre o relatório", negado(r), r.status);
    r = await api("GET", `/api/lr/relatorio/${A.id}?de=${new Date(Date.now() - 500 * 864e5).toISOString()}`, { token: patrao.token });
    checar("período acima de 400 dias é recusado", r.status === 400, r.status);

    console.log("\nCadastro do cliente");
    const cel = "114" + sufixo + "77";
    const cad = (senha, extra = {}) =>
      api("POST", "/api/lr/cadastro", { body: { slug: A.slug, nome: "  Maria   da  Silva ", celular: cel, senha, final_placa: "M77", ...extra } });
    for (const fraca of ["12345678", "11111111", "senha123", cel.slice(-8), "87654321"]) {
      r = await cad(fraca);
      checar(`recusa senha fácil "${fraca}"`, r.status === 400 && /fácil|8 caracteres/.test(r.data?.message || ""), r.data);
    }
    r = await cad("curta1");
    checar("recusa senha com menos de 8", r.status === 400, r.status);
    r = await cad("lavagem2026", { placa: "XX" });
    checar("recusa placa inválida", r.status === 400, r.status);
    r = await cad("lavagem2026");
    checar("cadastra com senha boa", r.status === 201, r.data);
    const novo = (await api("GET", `/api/collections/usuarios/records?filter=${qs(`celular="${cel}"`)}`, { token: ADM })).data.items[0];
    if (novo) criados.usuarios.push(novo.id);
    checar("nome fica limpo (sem espaços sobrando)", novo && novo.nome === "Maria da Silva", novo && novo.nome);
    r = await cad("outrasenha99");
    checar("mesmo celular não cadastra duas vezes", r.status === 400 && /já tem cadastro/.test(r.data?.message || ""), r.data);
    r = await api("POST", "/api/collections/usuarios/auth-with-password", { body: { identity: cel, password: "lavagem2026" } });
    checar("entra com o celular e a senha cadastrados", r.status === 200);
    const tk = r.data.token;
    r = await api("PATCH", `/api/collections/usuarios/records/${novo.id}`, { token: tk, body: { oldPassword: "lavagem2026", password: "12345678", passwordConfirm: "12345678" } });
    checar("em Minha conta também não troca para senha fácil", r.status === 400, r.status);
    r = await api("PATCH", `/api/collections/usuarios/records/${novo.id}`, { token: tk, body: { oldPassword: "lavagem2026", password: "novaSenha2026", passwordConfirm: "novaSenha2026" } });
    checar("troca para senha boa em Minha conta", r.status === 200, r.data);
    r = await api("POST", "/api/lr/equipe", { token: patrao.token, body: { empresa: A.id, nome: "Novo", celular: "114" + sufixo + "78", senha: "00000000", papel: "funcionario" } });
    checar("patrão também não cadastra funcionário com senha fácil", r.status === 400, r.status);

    console.log("\nLogin lembrado e tempo real");
    r = await api("POST", "/api/collections/usuarios/auth-with-password", { body: { identity: c2.celular, password: "senha12345" } });
    const exp = r.data && JSON.parse(Buffer.from(r.data.token.split(".")[1], "base64url")).exp;
    checar("sessão dura ~60 dias (não pede a senha toda hora)", exp && exp * 1000 - Date.now() > 59 * 864e5, exp && new Date(exp * 1000).toISOString());
    const ctl = new AbortController();
    const rt = await fetch(PB + "/api/realtime", { signal: ctl.signal });
    checar("conexão do tempo real abre (atualização na hora)", rt.status === 200 && (rt.headers.get("content-type") || "").includes("event-stream"), rt.status);
    ctl.abort();
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
