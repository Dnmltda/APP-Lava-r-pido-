#!/usr/bin/env node
// Deixa a produção limpa para testes com pessoas de verdade:
//   - apaga empresas de teste automático (slug "teste-*") e tudo delas;
//   - apaga todas as contas, MENOS os celulares em MANTER;
//   - na empresa demo, apaga o movimento (fila, pedidos, vendas, avaliações, caixa,
//     vales, holerites, metas, bônus, eventos de câmera). Mantém a configuração,
//     serviços, produtos e câmeras.
// O histórico de auditoria é imutável por regra do sistema e não é apagado.
//
//   PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/limpar-producao.mjs            (só mostra)
//   PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/limpar-producao.mjs --executar  (apaga)

const PB = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
const EXECUTAR = process.argv.includes("--executar");
const MANTER = (process.env.MANTER || "11900000001,11900000002,11900000003,11900000004,11900000005").split(",");
const q = encodeURIComponent;

async function api(method, path, token, body) {
  for (let t = 0; ; t++) {
    const res = await fetch(PB + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && t < 30) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    const txt = await res.text();
    if (!res.ok && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${txt}`);
    return txt ? JSON.parse(txt) : null;
  }
}
async function todos(col, filtro, token) {
  const out = [];
  for (let p = 1; ; p++) {
    const r = await api("GET", `/api/collections/${col}/records?perPage=500&page=${p}${filtro ? "&filter=" + q(filtro) : ""}`, token);
    out.push(...r.items);
    if (p >= r.totalPages) return out;
  }
}
async function apagar(col, lista, token, rotulo) {
  console.log(`${EXECUTAR ? "Apagando" : "Apagaria"} ${lista.length} ${rotulo || col}`);
  if (!EXECUTAR) return;
  for (const r of lista) await api("DELETE", `/api/collections/${col}/records/${r.id}`, token);
}

const token = (await api("POST", "/api/collections/_superusers/auth-with-password", null, { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD })).token;
console.log(`Servidor: ${PB}${EXECUTAR ? "" : "   (simulação — nada é apagado; use --executar)"}\n`);

// 1. Empresas de teste automático
const testes = await todos("empresas", 'slug ~ "teste-"', token);
await apagar("empresas", testes, token, `empresas de teste (${testes.map((e) => e.slug).join(", ") || "nenhuma"})`);

// 2. Movimento da demo
const demo = (await todos("empresas", 'slug = "demo"', token))[0];
if (demo) {
  const e = `empresa = "${demo.id}"`;
  await apagar("vendas_itens", await todos("vendas_itens", e, token), token, "itens de venda da demo");
  await apagar("vendas", await todos("vendas", e, token), token, "vendas da demo");
  await apagar("avaliacoes", await todos("avaliacoes", e, token), token, "avaliações da demo");
  await apagar("itens_pedido", await todos("itens_pedido", e, token), token, "produtos reservados da demo");
  await apagar("fila_entradas", await todos("fila_entradas", e, token), token, "lavagens/entradas na fila da demo");
  for (const c of ["lancamentos_caixa", "vales", "holerites", "metas", "regras_bonus", "camera_eventos"]) {
    await apagar(c, await todos(c, e, token), token, `${c} da demo`);
  }
}

// 3. Contas (menos as mantidas)
const usuarios = await todos("usuarios", "", token);
const sair = usuarios.filter((u) => !MANTER.includes(u.celular));
console.log(`Mantendo: ${usuarios.filter((u) => MANTER.includes(u.celular)).map((u) => `${u.celular} (${u.nome})`).join(", ")}`);
await apagar("usuarios", sair, token, `contas (${sair.map((u) => u.celular).join(", ") || "nenhuma"})`);

console.log(EXECUTAR ? "\nPronto." : "\nSimulação concluída.");
