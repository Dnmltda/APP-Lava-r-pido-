#!/usr/bin/env node
// Etapa 8 — Teste completo no navegador, um "celular" para cada perfil.
//
// Cria um lava rápido de teste, entra com patrão, gerente, funcionário, responsável
// pela fila e cliente (tela de celular) e confere:
//   - o que cada perfil vê no menu (tabela 1.3) e que link direto não abre tela proibida;
//   - o fluxo inteiro: cliente entra na fila → responsável confirma → funcionário lava e
//     dá baixa → cliente avalia → patrão vê a avaliação com o nome;
//   - todas as telas de cada perfil abrem sem erro de JavaScript.
//
//   APP_URL=http://127.0.0.1:5173 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-navegador.mjs [pasta-das-fotos]
//
// Precisa do Playwright (PLAYWRIGHT_MODULE aponta para ele, se não estiver instalado no projeto).

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const APP = (process.env.APP_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}
const FOTOS = process.argv[2] || "";
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });

const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 400) : ""));
  }
}
async function api(method, p, { token, body } = {}, tentativa = 0) {
  const res = await fetch(PB + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Na produção o limite de pedidos pode mandar esperar: espera e tenta de novo
  // (senão a limpeza do final deixa sobras).
  if (res.status === 429 && tentativa < 15) {
    await new Promise((r) => setTimeout(r, 5000));
    return api(method, p, { token, body }, tentativa + 1);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const MENU = ["Fila", "Vendas", "Dashboard", "Painel do dia", "Caixa", "Avaliações", "Minha área", "Clientes", "Equipe", "Serviços", "Produtos", "Cartaz", "Configurações", "Câmeras"];
// O que cada perfil deve ver no menu (tabela 1.3)
const VE = {
  patrao: ["Fila", "Vendas", "Dashboard", "Painel do dia", "Caixa", "Avaliações", "Clientes", "Equipe", "Serviços", "Produtos", "Cartaz", "Configurações", "Câmeras"],
  gerente: ["Fila", "Vendas", "Dashboard", "Painel do dia", "Caixa", "Avaliações", "Minha área"],
  funcionario: ["Fila", "Vendas", "Avaliações", "Minha área"],
  responsavel: ["Fila", "Vendas", "Avaliações", "Minha área"],
  cliente: [],
};
const ROTA = {
  Fila: "fila", Vendas: "vendas", Dashboard: "dashboard", "Painel do dia": "painel", Caixa: "caixa", Avaliações: "avaliacoes", "Minha área": "minha-area", Clientes: "clientes",
  Equipe: "equipe", Serviços: "servicos", Produtos: "produtos", Cartaz: "cartaz", Configurações: "configuracoes", Câmeras: "cameras",
};

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
  const HORARIO = [0, 1, 2, 3, 4, 5, 6].map(() => ({ aberto: true, abre: "00:00", fecha: "23:59" }));
  const A = await criar("empresas", { nome: "Lava Teste Navegador", slug: "teste-nav-" + sufixo, ativo: true, capacidade_simultanea: 2, horario_funcionamento: HORARIO, cor_principal: "#0E7490" });
  await criar("servicos", { empresa: A.id, nome: "Lavagem simples", preco: 40, duracao_media_min: 30, ativo: true });
  await criar("produtos", { empresa: A.id, nome: "Cheirinho", preco: 10, estoque: 50, estoque_minimo: 1, comissao_tipo: "nenhuma", comissao_valor: 0, ativo: true });
  await criar("cameras", { empresa: A.id, nome: "Box 1", tipo_integracao: "demonstracao", ativo: true });
  let seq = 0;
  const pessoas = {};
  for (const [chave, nome, papel, extra] of [
    ["patrao", "Paulo Patrão", "patrao", {}],
    ["gerente", "Gina Gerente", "gerente", {}],
    ["funcionario", "Fábio Lavador", "funcionario", {}],
    ["responsavel", "Rita Responsável", "funcionario", { responsavel_fila: true }],
    ["cliente", "Carla Navegadora", "cliente", {}],
  ]) {
    const celular = "119" + sufixo + String(seq++).padStart(2, "0");
    const u = await criar("usuarios", { nome, celular, password: "senha12345", passwordConfirm: "senha12345" });
    await criar("vinculos", { usuario: u.id, empresa: A.id, papel, ativo: true, ...extra });
    pessoas[chave] = { ...u, celular };
  }
  await criar("veiculos", { cliente: pessoas.cliente.id, placa: "NAV1A23", final_placa: "A23", modelo: "Onix", cor: "Prata", ativo: true });

  const navegador = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
  const erros = {};
  const paginas = {};
  const foto = async (p, nome) => FOTOS && (await paginas[p].screenshot({ path: path.join(FOTOS, `${nome}.png`), fullPage: true }));

  try {
    console.log("Login de cada perfil (tela de celular)");
    for (const p of Object.keys(pessoas)) {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      const page = await ctx.newPage();
      erros[p] = [];
      page.on("pageerror", (e) => erros[p].push(String(e)));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text()) && erros[p].push(m.text()));
      // Tempo real e servidor: nenhuma resposta de erro inesperada.
      page.on("response", (r) => (r.status() >= 500 || (r.url().includes("/api/realtime") && r.status() >= 400)) && erros[p].push(`${r.status()} ${r.url()}`));
      await page.goto(`${APP}/${A.slug}/entrar`);
      await page.fill('input[type="tel"]', pessoas[p].celular);
      await page.fill('input[type="password"]', "senha12345");
      await page.click('button[type="submit"]');
      await page.getByText("Minha conta").waitFor({ timeout: 15000 });
      paginas[p] = page;
      checar(`${p}: entra com celular e senha`, true);
    }

    console.log("\nCadastro de cliente novo pela tela");
    {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      const novo = await ctx.newPage();
      const errosNovo = [];
      novo.on("pageerror", (e) => errosNovo.push(String(e)));
      await novo.goto(`${APP}/${A.slug}/entrar`);
      await novo.getByRole("link", { name: "Criar meu cadastro" }).click();
      const celNovo = "118" + sufixo + "99";
      await novo.getByLabel("Seu nome").fill("Nova Testadora");
      await novo.getByLabel("Celular").fill(celNovo);
      await novo.getByLabel("Crie uma senha").fill("12345678");
      await novo.getByLabel("Placa").fill("TST1E23");
      await novo.getByRole("button", { name: "Criar cadastro" }).click();
      await novo.getByText(/fácil de adivinhar/).waitFor({ timeout: 10000 }).catch(() => {});
      checar("cadastro recusa senha fácil com mensagem clara", await novo.getByText(/fácil de adivinhar/).isVisible());
      await novo.getByLabel("Crie uma senha").fill("Lavagem2026");
      await novo.getByRole("button", { name: "Mostrar" }).click();
      checar("botão Mostrar revela a senha digitada", (await novo.getByLabel("Crie uma senha").getAttribute("type")) === "text");
      await novo.getByRole("button", { name: "Criar cadastro" }).click();
      await novo.getByRole("button", { name: "Entrar na fila" }).waitFor({ timeout: 20000 }).catch(() => {});
      checar("cliente novo se cadastra e já entra no app", await novo.getByRole("button", { name: "Entrar na fila" }).isVisible());
      const u = await api("GET", `/api/collections/usuarios/records?filter=${encodeURIComponent(`celular="${celNovo}"`)}`, { token: ADM });
      if (u.data.items[0]) criados.usuarios.push(u.data.items[0].id);
      checar("conta gravada no banco como cliente deste lava rápido", u.data.items.length === 1);
      await novo.getByRole("link", { name: "Minha conta" }).click();
      await novo.getByRole("button", { name: "Sair do app" }).click();
      await novo.waitForURL(/\/entrar$/, { timeout: 10000 }).catch(() => {});
      checar("depois de sair, o login já vem com o celular preenchido", (await novo.getByLabel("Celular").inputValue()).replace(/\D/g, "") === celNovo);
      checar("cadastro sem erro de JavaScript", errosNovo.length === 0, errosNovo);
      await ctx.close();
    }

    console.log("\nMenu de cada perfil (tabela 1.3)");
    for (const p of Object.keys(pessoas)) {
      const page = paginas[p];
      const visiveis = [];
      for (const item of MENU) {
        if (await page.locator(`a[href="/${A.slug}/${ROTA[item]}"]`).count()) visiveis.push(item);
      }
      checar(`${p}: vê exatamente ${VE[p].length ? VE[p].join(", ") : "nada da equipe"}`, JSON.stringify(visiveis) === JSON.stringify(VE[p]), visiveis);
      await foto(p, `menu-${p}`);
    }

    console.log("\nLink direto para tela proibida volta para o início");
    const proibidas = { gerente: ["equipe", "cameras", "configuracoes", "servicos"], funcionario: ["painel", "caixa", "fechamento", "cameras", "equipe"], cliente: ["fila", "vendas", "painel", "cameras", "avaliacoes"] };
    for (const [p, rotas] of Object.entries(proibidas)) {
      for (const r of rotas) {
        await paginas[p].goto(`${APP}/${A.slug}/${r}`);
        // Espera o app conferir o perfil e voltar para o início (até 10 s em rede lenta).
        await paginas[p].waitForURL((u) => !u.pathname.endsWith("/" + r), { timeout: 10000 }).catch(() => {});
        const url = new URL(paginas[p].url()).pathname;
        const dados = await paginas[p].locator("body").innerText();
        checar(`${p}: /${r} não abre`, url === `/${A.slug}` || url === `/${A.slug}/` || /permiss|não tem acesso|só (o )?patr/i.test(dados), url);
      }
    }

    console.log("\nFluxo completo: fila → confirmar → lavar → baixa → avaliar");
    const cli = paginas.cliente;
    await cli.goto(`${APP}/${A.slug}`);
    // Vitrine: separa um produto antes de entrar na fila (vai junto)
    await cli.getByRole("heading", { name: "Produtos" }).waitFor({ timeout: 15000 });
    await cli.getByRole("listitem").filter({ hasText: "Cheirinho" }).getByRole("button", { name: "Reservar" }).click();
    await cli.getByRole("button", { name: /Pôr no carrinho/ }).click();
    checar("cliente vê a vitrine e põe produto no carrinho antes de entrar", await cli.getByText(/1 produto/).isVisible());
    await cli.getByRole("button", { name: "Entrar na fila" }).click();
    await cli.getByText("Lavagem simples").first().click();
    await cli.getByRole("button", { name: "Confirmar e entrar na fila" }).click();
    await cli.waitForTimeout(1500);
    await foto("cliente", "1-cliente-na-fila");
    const naFila = await api("GET", `/api/collections/fila_entradas/records?filter=${encodeURIComponent(`empresa="${A.id}" && cliente="${pessoas.cliente.id}"`)}`, { token: ADM });
    const entrada = naFila.data.items[0];
    checar("cliente entra na fila pelo app (pendente)", entrada && entrada.status === "pendente", entrada && entrada.status);
    const itensDe = async () => (await api("GET", `/api/collections/itens_pedido/records?filter=${encodeURIComponent(`entrada="${entrada.id}"`)}`, { token: ADM })).data.items;
    checar("o produto do carrinho foi junto para o pedido", (await itensDe()).length === 1);
    // Já na fila, reserva mais um pela vitrine
    await cli.getByRole("listitem").filter({ hasText: "Cheirinho" }).getByRole("button", { name: "Reservar" }).click();
    await cli.getByRole("button", { name: /^Reservar/ }).last().click();
    await cli.waitForTimeout(1200);
    const qtdCheirinho = (await itensDe()).reduce((t, i) => t + i.quantidade, 0);
    checar("já na fila, reserva mais produto pela vitrine", qtdCheirinho === 2, qtdCheirinho);

    const resp = paginas.responsavel;
    await resp.goto(`${APP}/${A.slug}/fila`);
    await resp.getByText("Carla").first().waitFor({ timeout: 15000 });
    await foto("responsavel", "2-responsavel-ve-pendente");
    await resp.getByRole("button", { name: "Confirmar", exact: true }).first().click();
    await resp.waitForTimeout(1500);
    let st = (await api("GET", `/api/collections/fila_entradas/records/${entrada.id}`, { token: ADM })).data.status;
    checar("responsável pela fila confirma na tela", st === "confirmado", st);

    const func = paginas.funcionario;
    await func.goto(`${APP}/${A.slug}/fila`);
    await func.getByText("Carla").first().waitFor({ timeout: 15000 });
    checar("funcionário não vê botão de confirmar/recusar", (await func.getByRole("button", { name: "Recusar" }).count()) === 0);
    await func.getByRole("button", { name: "Iniciar lavagem" }).first().click();
    const mesmoAssim = func.getByRole("button", { name: "Iniciar mesmo assim" });
    if (await mesmoAssim.isVisible().catch(() => false)) await mesmoAssim.click();
    await func.waitForTimeout(1500);
    st = (await api("GET", `/api/collections/fila_entradas/records/${entrada.id}`, { token: ADM })).data.status;
    checar("funcionário inicia a lavagem", st === "lavando", st);
    await func.getByRole("button", { name: "Dar baixa" }).first().click();
    await func.getByRole("radio", { name: /Fábio/ }).click();
    await func.getByRole("button", { name: "Confirmar: carro lavado" }).click();
    await func.waitForTimeout(1500);
    const fin = (await api("GET", `/api/collections/fila_entradas/records/${entrada.id}`, { token: ADM })).data;
    checar("funcionário dá baixa registrando quem lavou", fin.status === "finalizado" && fin.lavado_por === pessoas.funcionario.id, fin.status);
    await foto("funcionario", "3-funcionario-deu-baixa");

    await cli.goto(`${APP}/${A.slug}/avaliar/${entrada.id}`);
    await cli.getByRole("radiogroup").first().waitFor({ timeout: 15000 });
    for (const grupo of await cli.getByRole("radiogroup").all()) await grupo.getByRole("radio", { name: "5 estrelas" }).click();
    await cli.locator("textarea").fill("Atendimento nota 10, teste do navegador");
    await cli.getByRole("button", { name: "Enviar avaliação" }).click();
    await cli.waitForTimeout(1500);
    await foto("cliente", "4-cliente-avaliou");
    const av = await api("GET", `/api/collections/avaliacoes/records?filter=${encodeURIComponent(`entrada="${entrada.id}"`)}`, { token: ADM });
    checar("cliente avalia com estrelas e comentário", av.data.items.length === 1 && av.data.items[0].nota_funcionario === 5, av.data.items);

    await cli.goto(`${APP}/${A.slug}`);
    await cli.getByRole("link", { name: /Meu histórico/ }).click();
    await cli.getByText("Suas visitas").waitFor({ timeout: 20000 }).catch(() => {});
    const txtHist = await cli.locator("body").innerText();
    checar("cliente vê no histórico: 1 vez, o serviço e o produto comprado", txtHist.includes("1 vez") && txtHist.includes("Lavagem simples") && !txtHist.includes("R$"), txtHist.slice(0, 300));
    await foto("cliente", "5-historico");

    await paginas.patrao.goto(`${APP}/${A.slug}/avaliacoes`);
    await paginas.patrao.getByText("teste do navegador").first().waitFor({ timeout: 10000 }).catch(() => {});
    const txtPatrao = await paginas.patrao.locator("body").innerText();
    checar("patrão vê a avaliação com o nome do cliente", txtPatrao.includes("teste do navegador") && txtPatrao.includes("Carla"), txtPatrao.slice(0, 300));
    await paginas.gerente.goto(`${APP}/${A.slug}/avaliacoes`);
    await paginas.gerente.getByText("teste do navegador").first().waitFor({ timeout: 10000 }).catch(() => {});
    const txtGerente = await paginas.gerente.locator("body").innerText();
    checar("gerente vê a avaliação sem o nome do cliente", txtGerente.includes("teste do navegador") && !txtGerente.includes("Carla"), txtGerente.slice(0, 300));

    console.log("\nDono libera acesso pela tela de Equipe");
    {
      const pat = paginas.patrao;
      await pat.goto(`${APP}/${A.slug}/clientes`);
      await pat.getByText("Carla").first().waitFor({ timeout: 15000 }).catch(() => {});
      checar("dono vê a lista de clientes com a Carla", (await pat.locator("body").innerText()).includes("Carla Navegadora"));
      await pat.getByText("Carla Navegadora").first().click();
      await pat.getByText("Gasto total").waitFor({ timeout: 10000 }).catch(() => {});
      checar("dono abre o cliente: visitas e gasto", await pat.getByText("Gasto total").isVisible());
      await pat.goto(`${APP}/${A.slug}/equipe`);
      await pat.getByText("Gina Gerente").first().click();
      await pat.getByRole("switch", { name: /Lista de clientes/ }).click();
      await pat.getByRole("button", { name: "Salvar", exact: true }).click();
      await pat.waitForTimeout(1500);
      const ger = paginas.gerente;
      await ger.goto(`${APP}/${A.slug}`);
      await ger.locator(`a[href="/${A.slug}/clientes"]`).waitFor({ timeout: 15000 }).catch(() => {});
      checar("gerente liberado passa a ter o atalho Clientes", (await ger.locator(`a[href="/${A.slug}/clientes"]`).count()) === 1);
      await ger.goto(`${APP}/${A.slug}/clientes`);
      await ger.getByText("Carla Navegadora").first().waitFor({ timeout: 15000 }).catch(() => {});
      checar("e abre a lista de clientes", (await ger.locator("body").innerText()).includes("Carla Navegadora"));
    }

    console.log("\nTipos de veículo, fotos antes/depois, fechamento do dia e gastos fixos");
    {
      const PNG = { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
      const pat = paginas.patrao;
      await pat.goto(`${APP}/${A.slug}/servicos`);
      await pat.getByRole("button", { name: /Criar tipos/ }).click();
      await pat.getByRole("button", { name: "+ Adicionar tipo" }).click();
      await pat.getByRole("button", { name: "+ Adicionar tipo" }).click();
      await pat.getByLabel("Tipo 1").fill("Carro grande");
      await pat.getByLabel("Tipo 2").fill("Uber");
      await pat.getByRole("switch", { name: /Só a equipe define/ }).nth(1).click();
      await pat.getByRole("button", { name: "Salvar tipos" }).click();
      await pat.waitForTimeout(1500);
      const tipos = (await api("GET", `/api/collections/empresas/records/${A.id}`, { token: ADM })).data.tipos_veiculo || [];
      const grande = tipos.find((t) => t.nome === "Carro grande");
      const uber = tipos.find((t) => t.nome === "Uber");
      checar("dono cria os tipos de veículo (Uber só a equipe define)", tipos.length === 2 && grande && !grande.restrito && uber?.restrito, tipos);
      await pat.getByRole("button", { name: /Lavagem simples/ }).click();
      await pat.getByLabel("Carro grande (R$)").fill("60");
      await pat.getByRole("button", { name: "Salvar", exact: true }).click();
      await pat.waitForTimeout(1500);
      const sv = (await api("GET", `/api/collections/servicos/records?filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: ADM })).data.items[0];
      checar("dono põe preço do carro grande no serviço", sv.precos_tipo?.[grande?.id] === 60, sv.precos_tipo);

      await cli.goto(`${APP}/${A.slug}`);
      await cli.getByRole("button", { name: "Entrar na fila" }).click();
      await cli.getByRole("radio", { name: "Carro grande" }).waitFor({ timeout: 10000 });
      checar("cliente escolhe o tipo, mas não vê o tipo restrito (Uber)", (await cli.getByRole("radio", { name: "Uber" }).count()) === 0);
      await cli.getByRole("radio", { name: "Carro grande" }).click();
      await cli.getByText("R$ 60,00").first().waitFor({ timeout: 10000 }).catch(() => {});
      checar("preço muda para o do carro grande", await cli.getByText("R$ 60,00").first().isVisible());
      await cli.getByText("Lavagem simples").first().click();
      await cli.getByRole("button", { name: "Confirmar e entrar na fila" }).click();
      await cli.waitForTimeout(1500);
      const filtroCli = encodeURIComponent(`empresa="${A.id}" && cliente="${pessoas.cliente.id}" && status="pendente"`);
      const nova = (await api("GET", `/api/collections/fila_entradas/records?filter=${filtroCli}`, { token: ADM })).data.items[0];
      checar("entrada grava o tipo e o preço do tipo", nova?.tipo_veiculo_nome === "Carro grande" && nova?.preco_servico === 60, nova && [nova.tipo_veiculo_nome, nova.preco_servico]);

      const ger = paginas.gerente;
      await ger.goto(`${APP}/${A.slug}/fila`);
      await ger.getByText("Carla").first().waitFor({ timeout: 15000 });
      await ger.getByRole("button", { name: "Tipo: Carro grande" }).first().click();
      await ger.getByRole("radio", { name: "Uber" }).click();
      await ger.getByRole("button", { name: "Salvar", exact: true }).click();
      await ger.waitForTimeout(1500);
      const trocada = (await api("GET", `/api/collections/fila_entradas/records/${nova.id}`, { token: ADM })).data;
      checar("gerente marca o carro como Uber e o preço volta ao padrão", trocada.tipo_veiculo_nome === "Uber" && trocada.preco_servico === 40, [trocada.tipo_veiculo_nome, trocada.preco_servico]);
      const vincCli = (await api("GET", `/api/collections/vinculos/records?filter=${encodeURIComponent(`usuario="${pessoas.cliente.id}"`)}`, { token: ADM })).data.items[0];
      checar("o app lembra o tipo deste carro para as próximas vezes", Object.values(vincCli.tipos_veiculos || {}).includes(uber?.id), vincCli.tipos_veiculos);

      await ger.getByRole("button", { name: "Fotos antes/depois" }).first().click();
      await ger.locator('input[type="file"]').setInputFiles(PNG);
      await ger.getByLabel(/Avarias/).fill("risco na porta");
      await ger.getByRole("button", { name: "Salvar fotos" }).click();
      await ger.getByText(/Avarias: risco na porta/).waitFor({ timeout: 15000 }).catch(() => {});
      const vist = (await api("GET", `/api/collections/vistorias/records?filter=${encodeURIComponent(`entrada="${nova.id}"`)}`, { token: ADM })).data.items;
      checar("gerente tira foto de antes com avarias", vist.length === 1 && vist[0].momento === "antes" && vist[0].avarias === "risco na porta", vist);
      await foto("gerente", "fotos-antes");
      await paginas.funcionario.goto(`${APP}/${A.slug}/fila`);
      await paginas.funcionario.getByText("Carla").first().waitFor({ timeout: 15000 });
      await paginas.funcionario.getByRole("button", { name: /Fotos \(1\)/ }).first().click();
      await paginas.funcionario.getByRole("img", { name: /Foto de antes/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
      checar("funcionário vê as fotos, mas não tem botão de tirar", (await paginas.funcionario.getByRole("img", { name: /Foto de antes/ }).count()) === 1 && (await paginas.funcionario.getByText("Tirar fotos").count()) === 0);

      await cli.goto(`${APP}/${A.slug}`);
      await cli.getByRole("button", { name: /Ver fotos do seu carro \(1\)/ }).waitFor({ timeout: 15000 }).catch(() => {});
      checar("cliente vê o botão com as fotos do carro dele", await cli.getByRole("button", { name: /Ver fotos do seu carro \(1\)/ }).isVisible());
      await cli.getByRole("button", { name: /Ver fotos do seu carro/ }).click();
      await cli.getByRole("img", { name: /Foto de antes/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
      await cli.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => /Foto de antes/.test(i.alt) && i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
      checar("e a foto carrega de verdade", await cli.evaluate(() => [...document.querySelectorAll("img")].some((i) => /Foto de antes/.test(i.alt) && i.naturalWidth > 0)));
      await foto("cliente", "fotos-do-carro");

      await ger.goto(`${APP}/${A.slug}/fechamento`);
      await ger.getByLabel("Cartão (R$)").fill("30,50");
      await ger.getByLabel("Dinheiro (R$)").fill("20");
      await ger.locator('input[type="file"]').setInputFiles(PNG);
      await ger.getByRole("button", { name: "Fechar o dia" }).click();
      await ger.getByText(/Fechamento salvo/).waitFor({ timeout: 15000 }).catch(() => {});
      const fd = (await api("GET", `/api/collections/fechamentos_dia/records?filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: ADM })).data.items;
      checar("gerente fecha o dia com valores e a nota anexada", fd.length === 1 && fd[0].cartao === 30.5 && fd[0].dinheiro === 20 && fd[0].anexos.length === 1, fd);
      await foto("gerente", "fechamento-dia");
      await pat.goto(`${APP}/${A.slug}/fechamento`);
      await pat.getByText("Notas do dia (1)").waitFor({ timeout: 15000 }).catch(() => {});
      checar("dono acompanha o fechamento e a nota", await pat.getByText("Notas do dia (1)").isVisible());
      await pat.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => i.alt === "Nota anexada" && i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
      checar("e a foto da nota carrega", await pat.evaluate(() => [...document.querySelectorAll("img")].some((i) => i.alt === "Nota anexada" && i.naturalWidth > 0)));

      await pat.goto(`${APP}/${A.slug}/caixa`);
      await pat.getByRole("button", { name: "+ Gasto fixo" }).click();
      await pat.getByLabel("O que é").fill("Aluguel do galpão");
      await pat.getByLabel("Valor (R$)").fill("1000");
      await pat.getByLabel("Vence todo dia").fill("1");
      await pat.getByRole("button", { name: "Salvar", exact: true }).click();
      await pat.waitForTimeout(2000);
      const lanc = (await api("GET", `/api/collections/lancamentos_caixa/records?filter=${encodeURIComponent(`empresa="${A.id}" && gasto_fixo!=""`)}`, { token: ADM })).data.items;
      checar("gasto fixo do dono já entra no caixa do mês", lanc.length === 1 && lanc[0].valor === 1000, lanc);
      checar("caixa mostra o fechamento do mês", await pat.getByText("Saldo do mês").isVisible());
      await foto("patrao", "caixa-mes");
      await ger.goto(`${APP}/${A.slug}/caixa`);
      await ger.getByText("Aluguel do galpão").first().waitFor({ timeout: 15000 }).catch(() => {});
      checar("gerente acompanha os gastos fixos (sem botão de criar)", (await ger.getByText("Aluguel do galpão").count()) > 0 && (await ger.getByRole("button", { name: "+ Gasto fixo" }).count()) === 0);
    }

    console.log("\nModo TV (sem login, tela grande)");
    {
      const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      const tv = await ctx.newPage();
      const errosTv = [];
      tv.on("pageerror", (e) => errosTv.push(String(e)));
      await tv.goto(`${APP}/${A.slug}/tv`);
      await tv.getByRole("heading", { name: "Lava Teste Navegador" }).waitFor({ timeout: 15000 }).catch(() => {});
      await tv.getByText("Carla").first().waitFor({ timeout: 15000 }).catch(() => {});
      const txt = await tv.locator("body").innerText();
      checar("Modo TV abre sem login e mostra a fila", /próximos/i.test(txt) && txt.includes("Carla") && new URL(tv.url()).pathname.endsWith("/tv"), txt.slice(0, 200));
      checar("Modo TV não mostra sobrenome, celular nem valores", !txt.includes("Navegadora") && !txt.includes("R$"));
      checar("Modo TV tem o QR Code para entrar na fila", (await tv.locator('[role="img"] svg').count()) === 1);
      checar("Modo TV sem erro de JavaScript", errosTv.length === 0, errosTv);
      if (FOTOS) await tv.screenshot({ path: path.join(FOTOS, "modo-tv.png") });
      await ctx.close();
    }

    console.log("\nTodas as telas de cada perfil abrem sem erro");
    for (const p of ["patrao", "gerente", "funcionario", "responsavel"]) {
      const page = paginas[p];
      for (const item of VE[p]) {
        await page.goto(`${APP}/${A.slug}/${ROTA[item]}`);
        await page.waitForTimeout(1500);
        const corpo = await page.locator("body").innerText();
        const quebrou = /Algo deu errado|Não foi possível carregar/i.test(corpo);
        checar(`${p}: ${item}`, !quebrou && new URL(page.url()).pathname.endsWith(ROTA[item]), corpo.slice(0, 200));
        await foto(p, `tela-${p}-${ROTA[item]}`);
      }
      for (const extra of ["conta"]) {
        await page.goto(`${APP}/${A.slug}/${extra}`);
        await page.waitForTimeout(800);
      }
    }
    await cli.goto(`${APP}/${A.slug}/conta`);
    await cli.getByRole("link", { name: "Política de privacidade" }).click();
    await cli.getByText("Quem cuida dos seus dados").waitFor({ timeout: 10000 }).catch(() => {});
    checar("cliente abre a política de privacidade", (await cli.locator("body").innerText()).includes("Lava Teste Navegador"));
    await paginas.patrao.goto(`${APP}/${A.slug}/cartaz`);
    await paginas.patrao.locator('[role="img"] svg').waitFor({ timeout: 10000 }).catch(() => {});
    checar("patrão gera o cartaz com QR Code do lava rápido", (await paginas.patrao.locator('[role="img"] svg').count()) === 1 && (await paginas.patrao.locator("body").innerText()).includes(`/${A.slug}`));
    await foto("patrao", "cartaz");
    for (const p of Object.keys(pessoas)) checar(`${p}: nenhum erro de JavaScript`, erros[p].length === 0, erros[p]);
  } finally {
    await navegador.close();
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
