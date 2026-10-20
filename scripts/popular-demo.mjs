#!/usr/bin/env node
// Preenche a empresa DEMO com 30 dias de movimento fictício (lavagens, vendas e
// avaliações) para o dashboard ter o que mostrar. Só mexe no slug "demo".
// Tudo fica marcado com a observação "historico-demo" e pode ser apagado com --limpar.
//
//   PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/popular-demo.mjs [--limpar]

const PB = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
const MARCA = "historico-demo";
const SO_LIMPAR = process.argv.includes("--limpar");

async function api(method, path, token, body) {
  for (let tentativa = 0; ; tentativa++) {
    const res = await fetch(PB + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && tentativa < 20) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    const txt = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${txt}`);
    return txt ? JSON.parse(txt) : null;
  }
}
const q = encodeURIComponent;
let semente = 7;
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646;
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const iso = (ms) => new Date(ms).toISOString().replace("T", " ");

const token = (await api("POST", "/api/collections/_superusers/auth-with-password", null, { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD })).token;
const empresa = (await api("GET", `/api/collections/empresas/records?filter=${q('slug="demo"')}`, token)).items[0];
if (!empresa) throw new Error("Empresa demo não encontrada (rode criar-empresa.mjs --demo).");

// Limpa o histórico anterior
const antigas = await api("GET", `/api/collections/fila_entradas/records?perPage=500&filter=${q(`empresa="${empresa.id}" && observacao="${MARCA}"`)}`, token);
for (const e of antigas.items) await api("DELETE", `/api/collections/fila_entradas/records/${e.id}`, token).catch(() => {});
const vendasAntigas = await api("GET", `/api/collections/vendas/records?perPage=500&filter=${q(`empresa="${empresa.id}" && motivo_correcao="${MARCA}"`)}`, token);
for (const v of vendasAntigas.items) await api("DELETE", `/api/collections/vendas/records/${v.id}`, token).catch(() => {});
console.log(`Removido: ${antigas.items.length} lavagens e ${vendasAntigas.items.length} vendas do histórico anterior.`);
if (SO_LIMPAR) process.exit(0);

const servicos = (await api("GET", `/api/collections/servicos/records?filter=${q(`empresa="${empresa.id}" && ativo=true`)}`, token)).items;
const produtos = (await api("GET", `/api/collections/produtos/records?filter=${q(`empresa="${empresa.id}" && ativo=true`)}`, token)).items;
const vinculos = (await api("GET", `/api/collections/vinculos/records?perPage=100&filter=${q(`empresa="${empresa.id}" && ativo=true`)}`, token)).items;
const equipe = vinculos.filter((v) => v.papel === "funcionario" || v.papel === "gerente").map((v) => v.usuario);
if (!servicos.length || !equipe.length) throw new Error("Demo sem serviços ou equipe.");

const OFFSET = 3 * 3600000;
const DIA = 86400000;
const hoje = Math.floor((Date.now() - OFFSET) / DIA) * DIA + OFFSET;
const NOMES = ["Ana", "Bruno", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gustavo", "Helena", "Igor", "Juliana", "Lucas", "Marina", "Paulo", "Renata", "Tiago"];
// Movimento mais forte no fim da manhã e no fim da tarde; sábado é o dia mais cheio.
const PESO_HORA = { 8: 1, 9: 3, 10: 4, 11: 3, 12: 1, 13: 2, 14: 3, 15: 4, 16: 4, 17: 2 };
const horasPesadas = Object.entries(PESO_HORA).flatMap(([h, p]) => Array(p).fill(Number(h)));
let lavagens = 0;
let vendas = 0;

for (let d = 30; d >= 1; d--) {
  const inicioDia = hoje - d * DIA;
  const dow = new Date(inicioDia - OFFSET).getUTCDay();
  if (dow === 0) continue; // domingo fechado
  const qtd = dow === 6 ? 10 + Math.floor(aleatorio() * 5) : 4 + Math.floor(aleatorio() * 6);
  for (let i = 0; i < qtd; i++) {
    const s = escolher(servicos);
    const hora = dow === 6 ? 8 + Math.floor(aleatorio() * 6) : escolher(horasPesadas);
    const inicio = inicioDia + hora * 3600000 + Math.floor(aleatorio() * 50) * 60000;
    const dur = Math.round(s.duracao_media_min * (0.8 + aleatorio() * 0.5));
    const pronto = inicio + dur * 60000;
    const lavador = escolher(equipe);
    const e = await api("POST", "/api/collections/fila_entradas/records", token, {
      empresa: empresa.id,
      servico: s.id,
      duracao_min: s.duracao_media_min,
      preco_servico: s.preco,
      origem: escolher(["app", "app", "balcao", "balcao", "reserva"]),
      status: "finalizado",
      nome_avulso: escolher(NOMES),
      final_placa_avulsa: String(100 + Math.floor(aleatorio() * 899)),
      ordem: 1,
      inicio_em: iso(inicio),
      pronto_em: iso(pronto),
      finalizado_em: iso(pronto + 5 * 60000),
      lavado_por: lavador,
      finalizado_por: lavador,
      observacao: MARCA,
    });
    lavagens++;
    if (produtos.length && aleatorio() < 0.45) {
      const itens = [escolher(produtos)];
      if (aleatorio() < 0.3) itens.push(escolher(produtos));
      const linhas = itens.map((p) => ({ p, qtd: 1 + Math.floor(aleatorio() * 2) }));
      const total = Math.round(linhas.reduce((t, l) => t + l.p.preco * l.qtd, 0) * 100) / 100;
      const v = await api("POST", "/api/collections/vendas/records", token, {
        empresa: empresa.id,
        funcionario: lavador,
        entrada: e.id,
        forma_pagamento: escolher(["pix", "pix", "cartao", "cartao", "dinheiro"]),
        total,
        comissao_total: 0,
        status: "fechada",
        fechada_em: iso(pronto + 6 * 60000),
        motivo_correcao: MARCA,
      });
      for (const l of linhas) {
        await api("POST", "/api/collections/vendas_itens/records", token, {
          empresa: empresa.id, venda: v.id, produto: l.p.id, produto_nome: l.p.nome, quantidade: l.qtd, preco_unitario: l.p.preco, comissao_calculada: 0,
        });
      }
      vendas++;
    }
  }
}
console.log(`Demo preenchida: ${lavagens} lavagens e ${vendas} vendas nos últimos 30 dias.`);
