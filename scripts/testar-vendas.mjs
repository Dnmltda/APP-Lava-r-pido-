#!/usr/bin/env node
// Teste da Etapa 4: produtos, carrinho/OS, vendas, bloqueio, estoque e comissão.
// "Funcionário não edita venda fechada; estoque confere."
// Roda contra um PocketBase de DESENVOLVIMENTO (cria e apaga dados "teste-*").
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-vendas.mjs

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
      nome, celular: "116" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token };
  };
  const estoque = async (id) => (await api("GET", `/api/collections/produtos/records/${id}`, { token: ADM })).data.estoque;

  try {
    console.log("Preparando dados de teste…");
    const A = await criar("empresas", { nome: "Teste Vendas A", slug: "teste-va-" + sufixo, ativo: true });
    const B = await criar("empresas", { nome: "Teste Vendas B", slug: "teste-vb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão A", A, "patrao");
    const gerente = await pessoa("Gerente A", A, "gerente");
    const func = await pessoa("Funcionário A", A, "funcionario");
    const func2 = await pessoa("Outro Funcionário A", A, "funcionario");
    const cliente = await pessoa("Cliente A", A, "cliente");
    const cliente2 = await pessoa("Outro Cliente A", A, "cliente");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const funcB = await pessoa("Funcionário B", B, "funcionario");
    const servico = await criar("servicos", { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true });
    const veiculo = await criar("veiculos", { cliente: cliente.usuario.id, final_placa: "V01", ativo: true });

    // ------------------------------------------------------------ produtos
    console.log("\nProdutos (só o patrão cadastra)");
    let r = await api("POST", "/api/collections/produtos/records", {
      token: patrao.token,
      body: { empresa: A.id, nome: "Cheirinho", preco: 15, estoque: 10, estoque_minimo: 3, comissao_tipo: "fixo", comissao_valor: 2, ativo: true },
    });
    checar("patrão cadastra produto", r.status === 200, r.data);
    const cheirinho = r.data;
    r = await api("POST", "/api/collections/produtos/records", {
      token: patrao.token,
      body: { empresa: A.id, nome: "Pretinho", preco: 30, estoque: 5, estoque_minimo: 1, comissao_tipo: "percentual", comissao_valor: 10, ativo: true },
    });
    const pretinho = r.data;
    r = await api("POST", "/api/collections/produtos/records", {
      token: patrao.token, body: { empresa: A.id, nome: "Fora de linha", preco: 5, estoque: 0, ativo: false },
    });
    const inativo = r.data;
    r = await api("POST", "/api/collections/produtos/records", {
      token: patraoB.token, body: { empresa: B.id, nome: "Produto B", preco: 9, estoque: 9, ativo: true },
    });
    const produtoB = r.data;
    r = await api("POST", "/api/collections/produtos/records", { token: gerente.token, body: { empresa: A.id, nome: "X", preco: 1, ativo: true } });
    checar("gerente não cadastra produto", negado(r), r.status);
    r = await api("PATCH", `/api/collections/produtos/records/${cheirinho.id}`, { token: func.token, body: { estoque: 999 } });
    checar("funcionário não mexe no estoque", negado(r), r.status);
    r = await api("PATCH", `/api/collections/produtos/records/${cheirinho.id}`, { token: patraoB.token, body: { preco: 0 } });
    checar("patrão B não mexe em produto da A", negado(r), r.status);
    r = await api("GET", `/api/collections/produtos/records`, { token: cliente.token });
    checar("cliente não lista produtos com estoque/comissão", r.data.items.length === 0, r.data.items.length);
    r = await api("GET", `/api/lr/catalogo/${A.slug}`);
    checar("catálogo público: só ativos, sem estoque nem comissão",
      r.data.length === 2 && !JSON.stringify(r.data).includes("comissao") && !JSON.stringify(r.data).includes("estoque"), r.data);

    // --------------------------------------------------------- carrinho/OS
    console.log("\nCarrinho ao entrar na fila → produtos a separar na OS");
    r = await api("POST", "/api/lr/fila/entrar", {
      token: cliente.token, body: { slug: A.slug, servico: servico.id, veiculo: veiculo.id, itens: [{ produto: produtoB.id, quantidade: 1 }] },
    });
    checar("não aceita produto de outra empresa no carrinho", r.status === 400, r.status);
    r = await api("POST", "/api/lr/fila/entrar", {
      token: cliente.token, body: { slug: A.slug, servico: servico.id, veiculo: veiculo.id, itens: [{ produto: inativo.id, quantidade: 1 }] },
    });
    checar("não aceita produto desativado", r.status === 400, r.status);
    r = await api("POST", "/api/lr/fila/entrar", {
      token: cliente.token,
      body: { slug: A.slug, servico: servico.id, veiculo: veiculo.id, itens: [{ produto: cheirinho.id, quantidade: 2 }, { produto: pretinho.id, quantidade: 1 }] },
    });
    checar("cliente entra na fila com carrinho", r.status === 201, r.data);
    const entrada = r.data.id;
    checar("carrinho não mexe no estoque (sem pagamento)", (await estoque(cheirinho.id)) === 10);
    r = await api("GET", `/api/collections/itens_pedido/records?filter=${encodeURIComponent(`entrada="${entrada}"`)}`, { token: cliente.token });
    checar("cliente vê os próprios itens", r.data.items.length === 2, r.data.items.length);
    const itemCheirinho = r.data.items.find((i) => i.produto === cheirinho.id);
    r = await api("GET", `/api/collections/itens_pedido/records`, { token: cliente2.token });
    checar("outro cliente não vê", r.data.items.length === 0);
    r = await api("GET", `/api/collections/itens_pedido/records`, { token: funcB.token });
    checar("equipe de outra empresa não vê", r.data.items.length === 0);
    r = await api("GET", `/api/collections/itens_pedido/records?filter=${encodeURIComponent(`entrada="${entrada}"`)}`, { token: func.token });
    checar("funcionário vê os produtos a separar", r.data.items.length === 2 && r.data.items.every((i) => i.status === "pendente"));
    r = await api("POST", `/api/lr/itens/${itemCheirinho.id}/status`, { token: cliente.token, body: { status: "separado" } });
    checar("cliente não marca separado", negado(r), r.status);
    r = await api("POST", `/api/lr/itens/${itemCheirinho.id}/status`, { token: funcB.token, body: { status: "separado" } });
    checar("funcionário de outra empresa não marca", negado(r), r.status);
    r = await api("POST", `/api/lr/itens/${itemCheirinho.id}/status`, { token: func.token, body: { status: "separado" } });
    checar("funcionário marca 'separado'", r.status === 200 && r.data.status === "separado", r.data);
    r = await api("POST", `/api/lr/itens/${itemCheirinho.id}/status`, { token: func.token, body: { status: "em_falta" } });
    checar("funcionário marca 'em falta'", r.status === 200 && r.data.status === "em_falta", r.data);

    // -------------------------------------------------------------- vendas
    console.log("\nVenda na OS do carro");
    r = await api("POST", "/api/collections/vendas/records", {
      token: func.token, body: { empresa: A.id, funcionario: func.usuario.id, status: "fechada", total: 0 },
    });
    checar("ninguém cria venda direto pela API", negado(r), r.status);
    r = await api("POST", "/api/lr/vendas", { token: cliente.token, body: { empresa: A.id, itens: [{ produto: cheirinho.id, quantidade: 1 }] } });
    checar("cliente não registra venda", r.status === 403, r.status);
    r = await api("POST", "/api/lr/vendas", { token: funcB.token, body: { empresa: A.id, itens: [{ produto: cheirinho.id, quantidade: 1 }] } });
    checar("funcionário de outra empresa não registra venda", r.status === 403, r.status);
    r = await api("POST", "/api/lr/vendas", { token: func.token, body: { empresa: A.id, itens: [{ produto: produtoB.id, quantidade: 1 }] } });
    checar("não vende produto de outra empresa", r.status === 400, r.status);
    r = await api("POST", "/api/lr/vendas", {
      token: func.token, body: { empresa: A.id, entrada, itens: [{ produto: cheirinho.id, quantidade: 2 }] },
    });
    checar("funcionário abre venda na OS (aberta)", r.status === 201 && r.data.status === "aberta" && r.data.total === 30, r.data);
    const venda1 = r.data.id;
    checar("venda aberta não baixa estoque", (await estoque(cheirinho.id)) === 10);
    r = await api("POST", `/api/lr/vendas/${venda1}/editar`, {
      token: func.token, body: { itens: [{ produto: cheirinho.id, quantidade: 2 }, { produto: pretinho.id, quantidade: 1 }] },
    });
    checar("edita a venda enquanto aberta", r.status === 200 && r.data.total === 60, r.data);
    r = await api("POST", `/api/lr/vendas/${venda1}/fechar`, { token: func.token });
    checar("não fecha sem forma de pagamento", r.status === 400, r.status);
    r = await api("POST", `/api/lr/vendas/${venda1}/fechar`, { token: func2.token, body: { forma_pagamento: "pix" } });
    checar("outro funcionário não fecha venda de colega", negado(r), r.status);
    r = await api("POST", `/api/lr/vendas/${venda1}/fechar`, { token: func.token, body: { forma_pagamento: "pix" } });
    checar("fecha a venda (Pix na maquininha)", r.status === 200 && r.data.status === "fechada", r.data);
    checar("estoque baixou sozinho: Cheirinho 10 → 8", (await estoque(cheirinho.id)) === 8);
    checar("estoque baixou sozinho: Pretinho 5 → 4", (await estoque(pretinho.id)) === 4);
    r = await api("GET", `/api/collections/vendas/records/${venda1}`, { token: patrao.token });
    checar("venda presa ao login de quem vendeu, com data/hora", r.data.funcionario === func.usuario.id && !!r.data.fechada_em, r.data);
    checar("comissão desligada na empresa: 0", r.data.comissao_total === 0, r.data.comissao_total);

    console.log("\nBloqueio depois de fechada");
    r = await api("POST", `/api/lr/vendas/${venda1}/editar`, { token: func.token, body: { itens: [{ produto: cheirinho.id, quantidade: 1 }] } });
    checar("funcionário NÃO edita venda fechada", r.status === 403, r.status);
    r = await api("POST", `/api/lr/vendas/${venda1}/descartar`, { token: func.token });
    checar("funcionário NÃO descarta venda fechada", r.status === 403, r.status);
    r = await api("PATCH", `/api/collections/vendas/records/${venda1}`, { token: patrao.token, body: { total: 1 } });
    checar("nem o patrão altera direto pela API", negado(r), r.status);
    r = await api("POST", `/api/lr/vendas/${venda1}/corrigir`, {
      token: gerente.token, body: { itens: [{ produto: cheirinho.id, quantidade: 1 }], motivo: "teste" },
    });
    checar("gerente não corrige venda", r.status === 403, r.status);
    r = await api("POST", `/api/lr/vendas/${venda1}/corrigir`, { token: patrao.token, body: { itens: [{ produto: cheirinho.id, quantidade: 1 }] } });
    checar("patrão precisa informar o motivo", r.status === 400, r.status);
    r = await api("POST", `/api/lr/vendas/${venda1}/corrigir`, {
      token: patrao.token, body: { itens: [{ produto: cheirinho.id, quantidade: 1 }, { produto: pretinho.id, quantidade: 1 }], forma_pagamento: "dinheiro", motivo: "Cliente levou só 1 cheirinho" },
    });
    checar("patrão corrige com motivo", r.status === 200 && r.data.status === "corrigida" && r.data.total === 45, r.data);
    checar("estoque confere após correção: Cheirinho 8 → 9", (await estoque(cheirinho.id)) === 9);
    checar("estoque confere após correção: Pretinho continua 4", (await estoque(pretinho.id)) === 4);
    r = await api("GET", `/api/collections/auditoria/records?filter=${encodeURIComponent(`entidade_id="${venda1}"`)}`, { token: patrao.token });
    const corr = r.data.items.find((a) => a.acao === "venda_corrigir");
    checar("correção na auditoria com antes, depois e motivo",
      corr && corr.antes.total === 60 && corr.depois.total === 45 && corr.motivo === "Cliente levou só 1 cheirinho", corr);

    console.log("\nDescartar venda aberta");
    r = await api("POST", "/api/lr/vendas", { token: func2.token, body: { empresa: A.id, itens: [{ produto: cheirinho.id, quantidade: 3 }] } });
    const venda2 = r.data.id;
    r = await api("POST", `/api/lr/vendas/${venda2}/descartar`, { token: func2.token });
    checar("descarta venda aberta sem mexer no estoque", r.status === 200 && (await estoque(cheirinho.id)) === 9, r.data);

    console.log("\nComissão (ligada pelo patrão)");
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { comissao_ativa: true } });
    checar("patrão liga a comissão", r.status === 200 && r.data.comissao_ativa === true, r.data);
    r = await api("POST", "/api/lr/vendas", {
      token: func2.token,
      body: { empresa: A.id, itens: [{ produto: cheirinho.id, quantidade: 3 }, { produto: pretinho.id, quantidade: 2 }], forma_pagamento: "cartao", fechar: true },
    });
    checar("venda avulsa fechada direto", r.status === 201 && r.data.status === "fechada" && r.data.total === 105, r.data);
    const venda3 = r.data.id;
    r = await api("GET", `/api/collections/vendas/records/${venda3}`, { token: patrao.token });
    checar("comissão: 3 × R$2 (fixo) + 10% de R$60 = R$12", r.data.comissao_total === 12, r.data.comissao_total);
    r = await api("GET", `/api/collections/vendas_itens/records?filter=${encodeURIComponent(`venda="${venda3}"`)}`, { token: patrao.token });
    checar("comissão gravada por item", r.data.items.map((i) => i.comissao_calculada).sort().join() === "6,6", r.data.items.map((i) => i.comissao_calculada));

    console.log("\nQuem vê as vendas");
    r = await api("GET", "/api/collections/vendas/records?perPage=100", { token: func.token });
    checar("funcionário vê só as próprias vendas", r.data.items.length === 1 && r.data.items[0].id === venda1, r.data.items.map((v) => v.funcionario));
    r = await api("GET", "/api/collections/vendas_itens/records?perPage=100", { token: func.token });
    checar("funcionário vê só os itens das próprias vendas", r.data.items.every((i) => i.venda === venda1), r.data.items.length);
    r = await api("GET", "/api/collections/vendas/records?perPage=100", { token: gerente.token });
    checar("gerente vê todas as vendas da empresa", r.data.items.length === 3, r.data.items.length);
    r = await api("GET", "/api/collections/vendas/records?perPage=100", { token: cliente.token });
    checar("cliente não vê vendas", r.data.items.length === 0);
    r = await api("GET", "/api/collections/vendas/records?perPage=100", { token: patraoB.token });
    checar("patrão B não vê vendas da A", r.data.items.length === 0);

    console.log("\nEstoque baixo");
    checar("estoque final confere: Cheirinho 9 − 3 = 6, Pretinho 4 − 2 = 2", (await estoque(cheirinho.id)) === 6 && (await estoque(pretinho.id)) === 2);
    r = await api("POST", "/api/lr/vendas", {
      token: func.token, body: { empresa: A.id, itens: [{ produto: pretinho.id, quantidade: 1 }], forma_pagamento: "dinheiro", fechar: true },
    });
    r = await api("GET", `/api/collections/produtos/records?filter=${encodeURIComponent(`empresa="${A.id}" && estoque <= estoque_minimo && ativo = true`)}`, { token: patrao.token });
    checar("produto no mínimo aparece no filtro de estoque baixo", r.data.items.some((p) => p.id === pretinho.id), r.data.items.map((p) => p.nome));

    // ------------------------------------------------------------ limpeza
    console.log("\nLimpando dados de teste…");
    for (const col of ["auditoria", "vendas", "fila_entradas"]) {
      const lista = await api("GET", `/api/collections/${col}/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
      for (const x of lista.data.items) await api("DELETE", `/api/collections/${col}/records/${x.id}`, { token: ADM });
    }
    for (const p of [cheirinho, pretinho, inativo, produtoB]) await api("DELETE", `/api/collections/produtos/records/${p.id}`, { token: ADM });
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
