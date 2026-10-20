#!/usr/bin/env node
// Cria um lava rápido novo + o patrão dele (uso da DNM&LTDA, com o admin do PocketBase).
//
//   PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/criar-empresa.mjs \
//     --nome "Lava Rápido do Zé" --slug lava-do-ze --cor "#0E7490" \
//     --patrao-nome "José" --patrao-celular 11987654321 --patrao-senha "senha-forte"
//
//   node scripts/criar-empresa.mjs --demo
//     Cria a empresa fictícia "Lava Rápido Demo" (slug demo) com patrão, gerente,
//     funcionário responsável pela fila, funcionário e cliente. Senha de todos: demo12345

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;

function args() {
  const a = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (!v[i].startsWith("--")) continue;
    const chave = v[i].slice(2);
    a[chave] = v[i + 1] && !v[i + 1].startsWith("--") ? v[++i] : true;
  }
  return a;
}

async function api(method, path, token, body) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) throw new Error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  const a = args();
  const token = (await api("POST", "/api/collections/_superusers/auth-with-password", null, {
    identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD,
  })).token;

  const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ aberto: d !== 0, abre: "08:00", fecha: d === 6 ? "14:00" : "18:00" }));

  const empresaDados = a.demo
    ? {
        nome: "Lava Rápido Demo", slug: "demo", cor_principal: "#0E7490", whatsapp: "5511900000000",
        endereco: "Av. Exemplo, 100 - São Paulo/SP", horario_funcionamento: HORARIO, ativo: true,
      }
    : {
        nome: a.nome, slug: a.slug, cor_principal: a.cor || "#0E7490", whatsapp: a.whatsapp || "",
        endereco: a.endereco || "", horario_funcionamento: HORARIO, ativo: true,
      };
  if (!empresaDados.nome || !empresaDados.slug) throw new Error("Informe --nome e --slug (ou use --demo).");

  const empresa = await api("POST", "/api/collections/empresas/records", token, empresaDados);
  console.log(`Empresa criada: ${empresa.nome}  →  /${empresa.slug}`);

  const pessoas = a.demo
    ? [
        { nome: "Patrão Demo", celular: "11900000001", papel: "patrao" },
        { nome: "Gerente Demo", celular: "11900000002", papel: "gerente" },
        { nome: "Responsável Demo", celular: "11900000003", papel: "funcionario", responsavel_fila: true },
        { nome: "Funcionário Demo", celular: "11900000004", papel: "funcionario" },
        { nome: "Cliente Demo", celular: "11900000005", papel: "cliente" },
      ].map((p) => ({ ...p, senha: "demo12345" }))
    : [{ nome: a["patrao-nome"], celular: String(a["patrao-celular"] || "").replace(/\D/g, ""), senha: a["patrao-senha"], papel: "patrao" }];

  for (const p of pessoas) {
    if (!p.nome || !/^\d{10,11}$/.test(p.celular) || !p.senha || String(p.senha).length < 8) {
      throw new Error("Informe --patrao-nome, --patrao-celular (DDD + número) e --patrao-senha (mín. 8).");
    }
    let usuario;
    const existente = await api("GET", `/api/collections/usuarios/records?filter=${encodeURIComponent(`celular="${p.celular}"`)}`, token);
    if (existente.items.length) {
      usuario = existente.items[0];
      console.log(`  ${p.celular} já tinha conta; só vinculando.`);
    } else {
      usuario = await api("POST", "/api/collections/usuarios/records", token, {
        nome: p.nome, celular: p.celular, password: p.senha, passwordConfirm: p.senha,
      });
    }
    await api("POST", "/api/collections/vinculos/records", token, {
      usuario: usuario.id, empresa: empresa.id, papel: p.papel, responsavel_fila: !!p.responsavel_fila, ativo: true,
    });
    console.log(`  ${p.papel.padEnd(11)} ${p.nome} — celular ${p.celular}`);
    if (a.demo && p.papel === "cliente") {
      await api("POST", "/api/collections/veiculos/records", token, {
        cliente: usuario.id, placa: "DEM0A05", final_placa: "A05", modelo: "Onix", cor: "Prata", ativo: true,
      });
    }
  }

  if (a.demo) {
    const servicos = [
      { nome: "Lavagem simples", descricao: "Por fora, com secagem", preco: 40, duracao_media_min: 30, ordem_exibicao: 1 },
      { nome: "Lavagem completa", descricao: "Por dentro e por fora, com aspiração", preco: 70, duracao_media_min: 50, ordem_exibicao: 2 },
      { nome: "Completa + cera", descricao: "Completa com enceramento", preco: 110, duracao_media_min: 80, ordem_exibicao: 3 },
      { nome: "Higienização interna", descricao: "Bancos, carpetes e teto", preco: 250, duracao_media_min: 180, ordem_exibicao: 4 },
    ];
    for (const s of servicos) {
      await api("POST", "/api/collections/servicos/records", token, { ...s, empresa: empresa.id, ativo: true });
    }
    console.log(`  ${servicos.length} serviços de exemplo`);
    const produtos = [
      { nome: "Cheirinho de carro", preco: 15, estoque: 20, estoque_minimo: 5, comissao_tipo: "fixo", comissao_valor: 2 },
      { nome: "Pretinho para pneu", preco: 30, estoque: 10, estoque_minimo: 3, comissao_tipo: "percentual", comissao_valor: 10 },
      { nome: "Aromatizante spray", preco: 25, estoque: 8, estoque_minimo: 3, comissao_tipo: "nenhuma", comissao_valor: 0 },
      { nome: "Flanela de microfibra", preco: 12, estoque: 2, estoque_minimo: 3, comissao_tipo: "nenhuma", comissao_valor: 0 },
    ];
    for (const p of produtos) {
      await api("POST", "/api/collections/produtos/records", token, { ...p, empresa: empresa.id, ativo: true });
    }
    console.log(`  ${produtos.length} produtos de exemplo`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
