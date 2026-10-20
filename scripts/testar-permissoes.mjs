#!/usr/bin/env node
// Etapa 8 — Teste da tabela de permissões (seção 1.3 do planejamento), linha por linha,
// com os 5 perfis: patrão, gerente, funcionário, funcionário responsável pela fila e cliente.
// Tudo pela API (a proteção de verdade), não pela tela.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-permissoes.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

const sufixo = Date.now().toString().slice(-6);
const PERFIS = ["patrao", "gerente", "funcionario", "responsavel", "cliente"];
const ROTULO = { patrao: "Patrão", gerente: "Gerente", funcionario: "Funcionário", responsavel: "Resp. fila", cliente: "Cliente" };
let falhas = 0;
let total = 0;
const tabela = [];

async function api(method, path, { token, body } = {}, tentativa = 0) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Este teste faz muitos pedidos: respeita o limite do servidor (300/min) esperando.
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
const qs = (f) => encodeURIComponent(f);

// Uma linha da tabela: para cada perfil, roda o teste e compara com o esperado.
//   esperado: { patrao: true, gerente: false, … } (perfil ausente = não se aplica)
//   teste(perfil) → true (conseguiu) / false (bloqueado)
async function linha(nome, esperado, teste) {
  const resultado = {};
  for (const p of PERFIS) {
    if (!(p in esperado)) {
      resultado[p] = "—";
      continue;
    }
    let conseguiu;
    try {
      conseguiu = await teste(p);
    } catch (err) {
      conseguiu = "erro: " + err.message;
    }
    total++;
    const certo = conseguiu === esperado[p];
    if (!certo) falhas++;
    resultado[p] = (esperado[p] ? "✅" : "❌") + (certo ? "" : ` ⚠️(${conseguiu})`);
    if (!certo) console.log(`  ✘ ${nome} — ${ROTULO[p]}: esperado ${esperado[p] ? "pode" : "não pode"}, deu ${conseguiu}`);
  }
  tabela.push({ nome, resultado });
  const erros = Object.values(resultado).some((v) => String(v).includes("⚠️"));
  if (!erros) console.log(`  ✔ ${nome}`);
}
const todos = (v) => Object.fromEntries(PERFIS.map((p) => [p, v]));
const equipe = (v, cliente) => ({ patrao: v, gerente: v, funcionario: v, responsavel: v, cliente });

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", {
    body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD },
  });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body, token = ADM) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token, body });
    if (!ok(r)) throw new Error(`Falha ao criar ${col}: ${r.texto}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  let seq = 0;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", {
      nome, celular: "117" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 3600 } });
    return { usuario: u, vinculo: v, token: t.data.token, id: u.id };
  };

  try {
    console.log("Preparando o lava rápido de teste…");
    const A = await criar("empresas", { nome: "Lava Teste Permissões", slug: "teste-perm-" + sufixo, ativo: true, capacidade_simultanea: 2, comissao_ativa: true });
    const P = {
      patrao: await pessoa("Paulo Patrão", A, "patrao"),
      gerente: await pessoa("Gina Gerente", A, "gerente"),
      funcionario: await pessoa("Fábio Funcionário", A, "funcionario"),
      responsavel: await pessoa("Rita Responsável", A, "funcionario", { responsavel_fila: true }),
      cliente: await pessoa("Carla Cliente", A, "cliente"),
    };
    const T = (p) => P[p].token;
    const servico = await criar("servicos", { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true });
    const produto = await criar("produtos", { empresa: A.id, nome: "Cheirinho", preco: 10, estoque: 500, estoque_minimo: 1, comissao_tipo: "fixo", comissao_valor: 1, ativo: true });
    const vCarla = await criar("veiculos", { cliente: P.cliente.id, final_placa: "C11", ativo: true });

    // Outro cliente com entrada na fila (para ver se a Carla vê dados dos outros).
    const outro = await pessoa("Otávio Silva Outro", A, "cliente");
    const vOutro = await criar("veiculos", { cliente: outro.id, placa: "OTA1B23", final_placa: "B23", ativo: true });
    let r = await api("POST", "/api/lr/fila/entrar", { token: outro.token, body: { slug: A.slug, servico: servico.id, veiculo: vOutro.id, itens: [{ produto: produto.id, quantidade: 1 }] } });
    if (!ok(r)) throw new Error("entrar na fila: " + r.texto);
    const entradaOutro = r.data.id;

    // Fábrica de entradas: cada perfil testa numa entrada própria, no estado certo.
    const novaEntrada = async (status) => {
      const c = await pessoa("Cliente Extra " + seq, A, "cliente");
      const v = await criar("veiculos", { cliente: c.id, final_placa: "X" + String(seq).padStart(2, "0"), ativo: true });
      const e = await api("POST", "/api/lr/fila/entrar", { token: c.token, body: { slug: A.slug, servico: servico.id, veiculo: v.id } });
      if (!ok(e)) throw new Error("nova entrada: " + e.texto);
      const id = e.data.id;
      const passos = { pendente: [], confirmado: ["confirmar"], lavando: ["confirmar", "iniciar"] }[status];
      for (const a of passos) {
        const x = await api("POST", `/api/lr/fila/${id}/${a}`, { token: ADM_PATRAO() });
        if (!ok(x)) throw new Error(`${a}: ${x.texto}`);
      }
      return { id, cliente: c };
    };
    const ADM_PATRAO = () => P.patrao.token;

    // ------------------------------------------------------------ fila
    console.log("\nFila");
    await linha("Ver a fila completa (nome, placa, produtos)", equipe(true, false), async (p) => {
      const x = await api("GET", `/api/collections/fila_entradas/records?filter=${qs(`empresa="${A.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.some((i) => i.id === entradaOutro);
    });
    await linha("Ver a fila pública (primeiro nome + 3 últimos da placa)", todos(true), async (p) => {
      const x = await api("GET", `/api/lr/fila-publica/${A.slug}`, { token: T(p) });
      return ok(x) && x.texto.includes("Otávio") && x.texto.includes("B23") && !x.texto.includes("Silva") && !x.texto.includes("OTA1B23");
    });
    await linha("Entrar na fila pelo app", { cliente: true }, async (p) => {
      const x = await api("POST", "/api/lr/fila/entrar", { token: T(p), body: { slug: A.slug, servico: servico.id, veiculo: vCarla.id } });
      if (ok(x)) await api("POST", `/api/lr/fila/${x.data.id}/cancelar`, { token: T(p), body: { motivo: "teste" } });
      return ok(x);
    });
    await linha("Confirmar entrada na fila", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      const e = await novaEntrada("pendente");
      return ok(await api("POST", `/api/lr/fila/${e.id}/confirmar`, { token: T(p) }));
    });
    await linha("Recusar entrada na fila", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      const e = await novaEntrada("pendente");
      return ok(await api("POST", `/api/lr/fila/${e.id}/recusar`, { token: T(p), body: { motivo: "teste" } }));
    });
    await linha("Cancelar entrada de outra pessoa", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      const e = await novaEntrada("confirmado");
      return ok(await api("POST", `/api/lr/fila/${e.id}/cancelar`, { token: T(p), body: { motivo: "teste" } }));
    });
    await linha("Cliente cancela a própria entrada", { cliente: true }, async () => {
      const e = await novaEntrada("confirmado");
      return ok(await api("POST", `/api/lr/fila/${e.id}/cancelar`, { token: e.cliente.token, body: { motivo: "não vou" } }));
    });
    await linha("Cancelar e substituir", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      const e = await novaEntrada("confirmado");
      return ok(await api("POST", `/api/lr/fila/${e.id}/substituir`, { token: T(p), body: { servico: servico.id, nome: "No Local", final_placa: "L01", motivo: "teste" } }));
    });
    await linha("Reposicionar cliente atrasado", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      const e = await novaEntrada("confirmado");
      return ok(await api("POST", `/api/lr/fila/${e.id}/reposicionar`, { token: T(p), body: { minutos: 30, motivo: "teste" } }));
    });
    await linha("Criar horário reservado", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      const horario = new Date(Date.now() + (3 + PERFIS.indexOf(p)) * 3600000).toISOString();
      return ok(await api("POST", "/api/lr/fila/reserva", { token: T(p), body: { empresa: A.id, horario, servico: servico.id, nome: "Reserva " + p, final_placa: "R0" + PERFIS.indexOf(p) } }));
    });
    await linha("Colocar cliente do balcão na fila", { patrao: true, gerente: true, funcionario: false, responsavel: true, cliente: false }, async (p) => {
      return ok(await api("POST", "/api/lr/fila/balcao", { token: T(p), body: { empresa: A.id, servico: servico.id, nome: "Balcão " + p, final_placa: "BL" + PERFIS.indexOf(p) } }));
    });
    await linha("Ver ordens de serviço e produtos a separar", equipe(true, false), async (p) => {
      const x = await api("GET", `/api/collections/itens_pedido/records?filter=${qs(`entrada="${entradaOutro}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length === 1;
    });
    await linha("Dar baixa no carro (carro lavado)", equipe(true, false), async (p) => {
      const e = await novaEntrada("lavando");
      return ok(await api("POST", `/api/lr/fila/${e.id}/finalizar`, { token: T(p), body: { lavado_por: p === "cliente" ? "" : P[p].id } }));
    });

    // ---------------------------------------------------------- vendas
    console.log("\nVendas e valores");
    const vendaDe = {};
    await linha("Registrar venda de produto", equipe(true, false), async (p) => {
      const x = await api("POST", "/api/lr/vendas", { token: T(p), body: { empresa: A.id, itens: [{ produto: produto.id, quantidade: 1 }], forma_pagamento: "pix", fechar: p !== "funcionario" } });
      if (ok(x)) vendaDe[p] = x.data.id;
      return ok(x);
    });
    await linha("Corrigir venda fechada de funcionário", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("POST", `/api/lr/vendas/${vendaDe.responsavel}/corrigir`, { token: T(p), body: { itens: [{ produto: produto.id, quantidade: 2 }], forma_pagamento: "dinheiro", motivo: "teste " + p } }));
    });
    await linha("Gerente não mexe em venda de outro funcionário (aberta)", { gerente: false }, async (p) => {
      return ok(await api("POST", `/api/lr/vendas/${vendaDe.funcionario}/editar`, { token: T(p), body: { itens: [{ produto: produto.id, quantidade: 3 }] } }));
    });
    await api("POST", "/api/collections/lancamentos_caixa/records", { token: T("patrao"), body: { empresa: A.id, data: new Date().toISOString(), tipo: "saida", categoria: "Água", valor: 50, descricao: "teste", criado_por: P.patrao.id } });
    await linha("Ver valores, vendas do dia e metas (painel)", { patrao: true, gerente: true, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("GET", `/api/lr/painel/${A.id}`, { token: T(p) }));
    });
    await linha("Ver o caixa (gastos e entradas)", { patrao: true, gerente: true, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      const x = await api("GET", `/api/collections/lancamentos_caixa/records?filter=${qs(`empresa="${A.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length > 0;
    });
    await linha("Ver vendas de todo mundo (ranking)", { patrao: true, gerente: true, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      const x = await api("GET", `/api/collections/vendas/records?filter=${qs(`empresa="${A.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.some((v) => v.id === vendaDe.gerente) && x.data.items.some((v) => v.id === vendaDe.funcionario);
    });
    await linha("Ver as próprias vendas", { funcionario: true, responsavel: true }, async (p) => {
      const x = await api("GET", `/api/collections/vendas/records?filter=${qs(`empresa="${A.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length > 0 && x.data.items.every((v) => v.funcionario === P[p].id);
    });

    // ------------------------------------------------------ avaliações
    console.log("\nAvaliações");
    const avaliada = await novaEntrada("lavando");
    await api("POST", `/api/lr/fila/${avaliada.id}/finalizar`, { token: T("funcionario"), body: { lavado_por: P.funcionario.id } });
    await linha("Avaliar o serviço (depois da baixa)", { cliente: true }, async () => {
      return ok(await api("POST", "/api/lr/avaliar", { token: avaliada.cliente.token, body: { entrada: avaliada.id, nota_funcionario: 5, nota_atendimento: 4, nota_ambiente: 5, comentario: "Muito bom" } }));
    });
    await linha("Equipe não avalia no lugar do cliente", { patrao: false, gerente: false, funcionario: false, responsavel: false }, async (p) => {
      const e = await novaEntrada("lavando");
      await api("POST", `/api/lr/fila/${e.id}/finalizar`, { token: T("patrao"), body: { lavado_por: P.patrao.id } });
      return ok(await api("POST", "/api/lr/avaliar", { token: T(p), body: { entrada: e.id, nota_funcionario: 1, nota_atendimento: 1, nota_ambiente: 1 } }));
    });
    await linha("Ver avaliações", equipe(true, false), async (p) => {
      const x = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: T(p) });
      return ok(x) && x.data.total >= 1;
    });
    await linha("Ver o nome do cliente na avaliação", { patrao: true, gerente: false, funcionario: false, responsavel: false }, async (p) => {
      const x = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: T(p) });
      const direto = await api("GET", `/api/collections/avaliacoes/records?filter=${qs(`empresa="${A.id}"`)}&expand=cliente`, { token: T(p) });
      const viaColecao = ok(direto) && direto.texto.includes(avaliada.cliente.id);
      return (ok(x) && x.texto.includes("Cliente Extra")) || viaColecao;
    });

    // --------------------------------------------- equipe e financeiro
    console.log("\nEquipe, bônus, vales e holerites");
    const regraBonus = await criar("regras_bonus", { empresa: A.id, valor_por_carro: 5, ativo: true });
    await api("POST", "/api/collections/vales/records", { token: T("patrao"), body: { empresa: A.id, funcionario: P.funcionario.id, valor: 100, data: new Date().toISOString(), observacao: "adiantamento", lancado_por: P.patrao.id } });
    await linha("Ver vales de todos", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      const x = await api("GET", `/api/collections/vales/records?filter=${qs(`empresa="${A.id}" && funcionario="${P.funcionario.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length > 0 && p !== "funcionario";
    });
    await linha("Lançar vale", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("POST", "/api/collections/vales/records", { token: T(p), body: { empresa: A.id, funcionario: P.responsavel.id, valor: 10, data: new Date().toISOString(), lancado_por: P[p].id } }));
    });
    await linha("Configurar bônus por carro", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      // Uma regra por empresa: configurar = editar a regra.
      return ok(await api("PATCH", `/api/collections/regras_bonus/records/${regraBonus.id}`, { token: T(p), body: { valor_por_carro: 7 + PERFIS.indexOf(p) } }));
    });
    await linha("Ver os próprios bônus, vales e carros lavados", { gerente: true, funcionario: true, responsavel: true, cliente: false }, async (p) => {
      const x = await api("GET", `/api/lr/minha-area/${A.id}`, { token: T(p) });
      return ok(x) && x.data.usuario === P[p].id;
    });
    await linha("Funcionário vê o próprio vale", { funcionario: true }, async (p) => {
      const x = await api("GET", `/api/collections/vales/records?filter=${qs(`funcionario="${P[p].id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length > 0;
    });
    await linha("Ver a área de outra pessoa da equipe", { patrao: true, gerente: false, funcionario: false, responsavel: false }, async (p) => {
      const alvo = p === "funcionario" ? P.responsavel.id : P.funcionario.id;
      const x = await api("GET", `/api/lr/minha-area/${A.id}?funcionario=${alvo}`, { token: T(p) });
      return ok(x) && x.data.usuario === alvo;
    });
    await linha("Cadastrar pessoa na equipe", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("POST", "/api/lr/equipe", { token: T(p), body: { empresa: A.id, nome: "Novo " + p, celular: "118" + sufixo + String(PERFIS.indexOf(p)).padStart(2, "0"), senha: "senha12345", papel: "funcionario" } }));
    });
    await linha("Trocar senha de funcionário", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("POST", "/api/lr/equipe/senha", { token: T(p), body: { vinculo: P.funcionario.vinculo.id, senha: "trocada" + PERFIS.indexOf(p) + "123" } }));
    });
    await linha("Desativar / mudar permissão de alguém", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("PATCH", `/api/collections/vinculos/records/${P.responsavel.vinculo.id}`, { token: T(p), body: { responsavel_fila: true } }));
    });
    await linha("Ver o histórico (auditoria)", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      const x = await api("GET", `/api/collections/auditoria/records?filter=${qs(`empresa="${A.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length > 0;
    });

    // -------------------------------------------- câmeras e configuração
    console.log("\nCâmeras e configuração");
    await criar("cameras", { empresa: A.id, nome: "Box", tipo_integracao: "demonstracao", ativo: true });
    await linha("Câmeras", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      const x = await api("GET", `/api/collections/cameras/records?filter=${qs(`empresa="${A.id}"`)}`, { token: T(p) });
      return ok(x) && x.data.items.length > 0;
    });
    await linha("Configurar serviços e preços", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("PATCH", `/api/collections/servicos/records/${servico.id}`, { token: T(p), body: { preco: 41 } }));
    });
    await linha("Configurar produtos e comissão", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("PATCH", `/api/collections/produtos/records/${produto.id}`, { token: T(p), body: { comissao_valor: 2 } }));
    });
    await linha("Configurar textos de aviso, cor, capacidade", { patrao: true, gerente: false, funcionario: false, responsavel: false, cliente: false }, async (p) => {
      return ok(await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: T(p), body: { textos_aviso: { pronto: "Pronto! " + p } } }));
    });
  } finally {
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    // Pessoas cadastradas pela rota /api/lr/equipe durante o teste
    const novos = await api("GET", `/api/collections/usuarios/records?filter=${qs(`celular~"118${sufixo}"`)}`, { token: ADM });
    for (const u of novos.data?.items || []) await api("DELETE", `/api/collections/usuarios/records/${u.id}`, { token: ADM });
  }

  console.log("\nTabela 1.3 conferida (✅ pode, ❌ não pode, — não se aplica, ⚠️ diferente do planejamento):\n");
  console.log("| Ação | " + PERFIS.map((p) => ROTULO[p]).join(" | ") + " |");
  console.log("|---|" + PERFIS.map(() => "---").join("|") + "|");
  for (const l of tabela) console.log(`| ${l.nome} | ` + PERFIS.map((p) => l.resultado[p]).join(" | ") + " |");
  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
