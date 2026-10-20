#!/usr/bin/env node
// Teste: planos (pacotes), cartão fidelidade, reativar clientes, agendamento pelo cliente
// e orçamento. Regra do Diego: nada vira valor ou lugar na fila sem passar pela equipe.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-fidelizacao.mjs

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
const arquivo = (buf, nome, tipo) => new Blob([buf], { type: tipo });
function formulario(campos, arquivos) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, String(v));
  for (const [k, buf, nome, tipo] of arquivos) f.append(k, arquivo(buf, nome, tipo), nome);
  return f;
}

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
    const u = await criar("usuarios", { nome, celular: "113" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345" });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token, id: u.id };
  };
  const ler = async (col, id) => (await api("GET", `/api/collections/${col}/records/${id}`, { token: ADM })).data;

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Fidelização", slug: "teste-fid-" + sufixo, ativo: true, capacidade_simultanea: 2 });
    const B = await criar("empresas", { nome: "Teste Fidelização B", slug: "teste-fidb-" + sufixo, ativo: true });
    const patrao = await pessoa("Dono", A, "patrao");
    const gerente = await pessoa("Gerente", A, "gerente");
    const resp = await pessoa("Responsável", A, "funcionario", { responsavel_fila: true });
    const func = await pessoa("Funcionário", A, "funcionario");
    const c1 = await pessoa("Cliente Fiel", A, "cliente");
    const c2 = await pessoa("Cliente Dois", A, "cliente");
    const patraoB = await pessoa("Dono B", B, "patrao");
    const simples = await criar("servicos", { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true });
    const completa = await criar("servicos", { empresa: A.id, nome: "Completa", preco: 80, duracao_media_min: 60, ativo: true });
    const polimento = await criar("servicos", { empresa: A.id, nome: "Polimento", preco: 300, duracao_media_min: 240, ativo: true, sob_orcamento: true });
    const v1 = await criar("veiculos", { cliente: c1.id, final_placa: "F01", modelo: "HB20", cor: "Branco", porte: "pequeno", ativo: true });
    const v2 = await criar("veiculos", { cliente: c1.id, final_placa: "F02", modelo: "Onix", cor: "Preto", porte: "pequeno", ativo: true });
    const vOutro = await criar("veiculos", { cliente: c2.id, final_placa: "F03", modelo: "Gol", cor: "Prata", porte: "pequeno", ativo: true });
    const entrar = async (quem, veiculo, servico = simples) => {
      const r = await api("POST", "/api/lr/fila/entrar", { token: quem.token, body: { slug: A.slug, servico: servico.id, veiculos: [veiculo.id] } });
      return r.data && r.data.id ? ler("fila_entradas", r.data.id) : r;
    };
    const finalizar = async (en) => {
      for (const acao of ["confirmar", "iniciar"]) await api("POST", `/api/lr/fila/${en.id}/${acao}`, { token: gerente.token, body: {} });
      await api("POST", `/api/lr/fila/${en.id}/finalizar`, { token: gerente.token, body: { lavado_por: func.id } });
      return ler("fila_entradas", en.id);
    };

    console.log("\nPlanos: só o dono cria e muda; o cliente vê os ativos");
    let r = await api("POST", "/api/collections/planos/records", { token: gerente.token, body: { empresa: A.id, nome: "Mensal", preco: 120, validade_dias: 30, lavagens: 4, ativo: true } });
    checar("gerente não cria plano", negado(r), r.status);
    r = await api("POST", "/api/collections/planos/records", { token: patrao.token, body: { empresa: A.id, nome: "Mensal 4 simples", descricao: "4 lavagens simples por mês", preco: 120, validade_dias: 30, lavagens: 2, servicos: [simples.id], ativo: true } });
    checar("dono cria plano", ok(r), r.data);
    const plano = r.data;
    const pOculto = (await api("POST", "/api/collections/planos/records", { token: patrao.token, body: { empresa: A.id, nome: "Antigo", preco: 50, validade_dias: 10, lavagens: 1, ativo: false } })).data;
    r = await api("GET", `/api/collections/planos/records?filter=${qs(`empresa="${A.id}"`)}`, { token: c1.token });
    checar("cliente vê só os planos ativos", ok(r) && r.data.items.length === 1 && r.data.items[0].id === plano.id, r.data && r.data.items.map((x) => x.nome));
    r = await api("PATCH", `/api/collections/planos/records/${plano.id}`, { token: gerente.token, body: { preco: 1 } });
    checar("gerente não muda preço de plano", negado(r), r.status);
    r = await api("PATCH", `/api/collections/planos/records/${plano.id}`, { token: patraoB.token, body: { preco: 1 } });
    checar("dono de outra empresa não mexe", negado(r), r.status);

    console.log("\nPedido de plano: o cliente pede, o dono ativa depois de receber");
    r = await api("POST", "/api/lr/planos/pedir", { token: c1.token, body: { plano: pOculto.id, veiculo: v1.id } });
    checar("plano desativado não pode ser pedido", negado(r), r.status);
    r = await api("POST", "/api/lr/planos/pedir", { token: c1.token, body: { plano: plano.id, veiculo: vOutro.id } });
    checar("não pede plano para carro de outra pessoa", negado(r), r.status);
    r = await api("POST", "/api/lr/planos/pedir", { token: c1.token, body: { plano: plano.id, veiculo: v1.id } });
    checar("cliente pede o plano para o carro dele", r.status === 201, r.data);
    const ass = r.data;
    r = await api("POST", "/api/lr/planos/pedir", { token: c1.token, body: { plano: plano.id, veiculo: v1.id } });
    checar("não pede duas vezes para o mesmo carro", negado(r), r.status);
    r = await api("POST", `/api/lr/planos/${ass.id}/decidir`, { token: gerente.token, body: { aprovar: true, valor: 120, forma: "pix" } });
    checar("gerente não ativa plano", negado(r), r.status);
    r = await api("POST", `/api/lr/planos/${ass.id}/decidir`, { token: patrao.token, body: { aprovar: true, valor: 120, forma: "pix" } });
    checar("dono ativa depois de receber", ok(r) && r.data.status === "ativa", r.data);
    const caixa = (await api("GET", `/api/collections/lancamentos_caixa/records?filter=${qs(`empresa="${A.id}" && categoria="Planos"`)}`, { token: ADM })).data.items;
    checar("o valor do plano entra no caixa (Planos)", caixa.length === 1 && caixa[0].valor === 120 && caixa[0].tipo === "entrada", caixa);
    r = await api("GET", `/api/lr/meus-planos/${A.slug}`, { token: c1.token });
    checar("cliente vê o plano ativo e quantas lavagens restam", ok(r) && r.data.planos[0].status === "ativa" && r.data.planos[0].restantes === 2, r.data);

    console.log("\nUsar o plano na fila");
    let e1 = await entrar(c1, v1);
    checar("o plano não é usado sozinho (preço normal até a equipe usar)", e1.preco_servico === 40 && !e1.assinatura, e1.preco_servico);
    r = await api("GET", `/api/lr/beneficios/${A.id}`, { token: func.token });
    checar("a equipe vê que o carro tem plano", ok(r) && r.data[e1.id]?.plano?.restantes === 2, r.data);
    r = await api("POST", `/api/lr/beneficio/${e1.id}`, { token: func.token, body: { tipo: "plano", usar: true } });
    checar("funcionário comum não usa o plano", negado(r), r.status);
    r = await api("POST", `/api/lr/beneficio/${e1.id}`, { token: resp.token, body: { tipo: "plano", usar: true } });
    checar("responsável pela fila usa uma lavagem do plano (sai R$ 0)", ok(r) && r.data.preco_servico === 0, r.data);
    checar("e o plano desconta 1", (await ler("assinaturas", ass.id)).lavagens_usadas === 1);
    r = await api("POST", `/api/lr/beneficio/${e1.id}`, { token: resp.token, body: { tipo: "plano", usar: false } });
    checar("dá para desfazer (volta o preço e a lavagem)", ok(r) && r.data.preco_servico === 40 && (await ler("assinaturas", ass.id)).lavagens_usadas === 0, r.data);
    await api("POST", `/api/lr/beneficio/${e1.id}`, { token: resp.token, body: { tipo: "plano", usar: true } });
    await api("POST", `/api/lr/fila/${e1.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    checar("entrada cancelada devolve a lavagem do plano", (await ler("assinaturas", ass.id)).lavagens_usadas === 0);
    const eComp = await entrar(c1, v1, completa);
    r = await api("POST", `/api/lr/beneficio/${eComp.id}`, { token: resp.token, body: { tipo: "plano", usar: true } });
    checar("o plano não cobre serviço fora dele (Completa)", negado(r), r.data);
    await api("POST", `/api/lr/fila/${eComp.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    const eV2 = await entrar(c1, v2);
    r = await api("POST", `/api/lr/beneficio/${eV2.id}`, { token: resp.token, body: { tipo: "plano", usar: true } });
    checar("o plano vale só para o carro dele", negado(r), r.data);
    await api("POST", `/api/lr/fila/${eV2.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    for (let i = 0; i < 2; i++) {
      const en = await entrar(c1, v1);
      await api("POST", `/api/lr/beneficio/${en.id}`, { token: resp.token, body: { tipo: "plano", usar: true } });
      await finalizar(en);
    }
    const eSem = await entrar(c1, v1);
    r = await api("POST", `/api/lr/beneficio/${eSem.id}`, { token: resp.token, body: { tipo: "plano", usar: true } });
    checar("acabaram as lavagens do plano: não usa mais", negado(r), r.data);
    await api("POST", `/api/lr/fila/${eSem.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    r = await api("GET", `/api/lr/meus-planos/${A.slug}`, { token: c1.token });
    checar("cliente vê o plano como usado", r.data.planos[0].status === "usada" && r.data.planos[0].restantes === 0, r.data.planos[0]);
    r = await api("POST", "/api/lr/planos/pedir", { token: c1.token, body: { plano: plano.id, veiculo: v2.id } });
    const ass2 = r.data;
    r = await api("POST", `/api/lr/planos/${ass2.id}/decidir`, { token: patrao.token, body: { aprovar: false, motivo: "Não recebi" } });
    checar("dono pode recusar o pedido", ok(r) && r.data.status === "recusada", r.data);

    console.log("\nCartão fidelidade (a cada 2 lavagens, 1 prêmio)");
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: gerente.token, body: { fidelidade_ativa: true, fidelidade_meta: 2 } });
    checar("gerente não configura a fidelidade", negado(r), r.status);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patrao.token, body: { fidelidade_ativa: true, fidelidade_meta: 2, fidelidade_premio: "1 lavagem simples grátis" } });
    checar("dono liga a fidelidade", ok(r), r.status);
    r = await api("GET", `/api/lr/meus-planos/${A.slug}`, { token: c1.token });
    checar("lavagens pagas pelo plano não contam para a fidelidade", r.data.fidelidade && r.data.fidelidade.feitas === 0, r.data.fidelidade);
    for (let i = 0; i < 2; i++) await finalizar(await entrar(c1, v2));
    r = await api("GET", `/api/lr/meus-planos/${A.slug}`, { token: c1.token });
    checar("2 lavagens = 1 prêmio disponível", r.data.fidelidade.disponiveis === 1 && r.data.fidelidade.premio === "1 lavagem simples grátis", r.data.fidelidade);
    const ePremio = await entrar(c1, v2);
    r = await api("POST", `/api/lr/beneficio/${ePremio.id}`, { token: gerente.token, body: { tipo: "premio", usar: true } });
    checar("gerente usa o prêmio na fila (sai R$ 0)", ok(r) && r.data.preco_servico === 0, r.data);
    const eOutroPremio = await entrar(c1, v1);
    r = await api("POST", `/api/lr/beneficio/${eOutroPremio.id}`, { token: gerente.token, body: { tipo: "premio", usar: true } });
    checar("o mesmo prêmio não é usado duas vezes", negado(r), r.data);
    await api("POST", `/api/lr/fila/${eOutroPremio.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });
    await api("POST", `/api/lr/fila/${ePremio.id}/cancelar`, { token: c1.token, body: { motivo: "teste" } });

    console.log("\nReativar clientes que sumiram (30 dias)");
    await api("PATCH", `/api/collections/vinculos/records/${c2.vinculo.id}`, { token: ADM, body: {} });
    const antigo = new Date(Date.now() - 45 * 86400000).toISOString().replace("T", " ");
    const eAntiga = await criar("fila_entradas", { empresa: A.id, cliente: c2.id, veiculo: vOutro.id, servico: simples.id, origem: "app", status: "finalizado", ordem: 1, duracao_min: 30, preco_servico: 40, finalizado_em: antigo });
    r = await api("GET", `/api/lr/reativar/${A.id}`, { token: func.token });
    checar("funcionário não vê a lista", negado(r), r.status);
    r = await api("GET", `/api/lr/reativar/${A.id}`, { token: gerente.token });
    const sumido = r.data && r.data.clientes.find((x) => x.usuario === c2.id);
    checar("gerente vê quem não volta há 30 dias", ok(r) && !!sumido && sumido.visitas === 1, r.data);
    checar("quem veio há pouco não aparece", !r.data.clientes.some((x) => x.usuario === c1.id));
    r = await api("POST", `/api/lr/reativar/${A.id}/${c2.id}`, { token: patrao.token });
    checar("dono marca que mandou a mensagem", ok(r) && !!r.data.contatado_em, r.data);
    r = await api("GET", `/api/lr/reativar/${A.id}`, { token: patrao.token });
    checar("a lista mostra quando foi o último contato", !!r.data.clientes.find((x) => x.usuario === c2.id)?.contatado_em);
    r = await api("GET", `/api/lr/reativar/${A.id}`, { token: patraoB.token });
    checar("dono de outra empresa não vê", negado(r), r.status);
    void eAntiga;

    console.log("\nAgendamento pedido pelo cliente");
    const amanha = new Date(Date.now() + 26 * 3600000);
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: simples.id, veiculos: [v1.id, v2.id], horario: amanha.toISOString(), observacao: "Pode ser de manhã" } });
    checar("cliente pede um horário para 2 carros", r.status === 201, r.data);
    const ag = r.data;
    r = await api("GET", `/api/collections/fila_entradas/records?filter=${qs(`empresa="${A.id}" && cliente="${c1.id}" && (status="pendente" || status="confirmado")`)}`, { token: ADM });
    checar("o pedido ainda não ocupa lugar na fila", r.data.items.length === 0, r.data.items.length);
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: simples.id, veiculos: [v1.id], horario: new Date(Date.now() - 3600000).toISOString() } });
    checar("não agenda no passado", negado(r), r.data);
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: polimento.id, veiculos: [v1.id], horario: amanha.toISOString() } });
    checar("serviço sob orçamento não agenda sem orçamento aceito", negado(r), r.data);
    r = await api("POST", `/api/lr/agendamentos/${ag.id}/responder`, { token: func.token, body: { como: "no_horario" } });
    checar("funcionário comum não responde", negado(r), r.status);
    r = await api("POST", `/api/lr/agendamentos/${ag.id}/responder`, { token: resp.token, body: { como: "no_horario" } });
    checar("responsável confirma no horário pedido", ok(r) && r.data.entradas.length === 2, r.data);
    const reservas = await Promise.all(r.data.entradas.map((id) => ler("fila_entradas", id)));
    checar("os 2 carros viram reservas confirmadas, cada um com o seu preço", reservas.every((x) => x.origem === "reserva" && x.status === "confirmado" && x.preco_servico === 40 && x.cliente === c1.id), reservas.map((x) => [x.origem, x.status]));
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: simples.id, veiculos: [v1.id], horario: new Date(amanha.getTime() + 3600000).toISOString() } });
    r = await api("POST", `/api/lr/agendamentos/${r.data.id}/responder`, { token: resp.token, body: { como: "no_horario" } });
    checar("o mesmo carro não pega duas vezes perto do mesmo horário", r.status === 400 && /perto desse horário/.test(r.data?.message || ""), r.data);
    const eHoje = await entrar(c2, vOutro);
    r = await api("POST", "/api/lr/agendar", { token: c2.token, body: { slug: A.slug, servico: simples.id, veiculos: [vOutro.id], horario: new Date(Date.now() + 49 * 3600000).toISOString() } });
    r = await api("POST", `/api/lr/agendamentos/${r.data.id}/responder`, { token: resp.token, body: { como: "no_horario" } });
    checar("carro que está na fila hoje pode ser agendado para outro dia", ok(r), r.data);
    for (const id of r.data.entradas || []) await api("POST", `/api/lr/fila/${id}/cancelar`, { token: gerente.token, body: { motivo: "teste" } });
    await api("POST", `/api/lr/fila/${eHoje.id}/cancelar`, { token: c2.token, body: { motivo: "teste" } });
    r = await api("POST", "/api/lr/agendar", { token: c2.token, body: { slug: A.slug, servico: simples.id, veiculos: [vOutro.id], horario: amanha.toISOString() } });
    const ag2 = r.data;
    const outra = new Date(Date.now() + 50 * 3600000);
    r = await api("POST", `/api/lr/agendamentos/${ag2.id}/responder`, { token: gerente.token, body: { como: "outro_horario", horario: outra.toISOString(), resposta: "Amanhã está cheio" } });
    checar("gerente sugere outro horário (já reservado)", ok(r) && r.data.entradas.length === 1, r.data);
    const agLido = await ler("agendamentos", ag2.id);
    checar("o cliente vê o horário combinado e a resposta", agLido.status === "confirmado" && agLido.como === "outro_horario" && agLido.resposta === "Amanhã está cheio" && !!agLido.horario_confirmado, agLido);
    for (const id of [...reservas.map((x) => x.id), ...(r.data.entradas || [])]) await api("POST", `/api/lr/fila/${id}/cancelar`, { token: gerente.token, body: { motivo: "teste" } });
    r = await api("POST", "/api/lr/agendar", { token: c2.token, body: { slug: A.slug, servico: simples.id, veiculos: [vOutro.id], horario: amanha.toISOString() } });
    const ag3 = r.data;
    r = await api("POST", `/api/lr/agendamentos/${ag3.id}/responder`, { token: gerente.token, body: { como: "na_fila" } });
    const naFila = r.data.entradas && (await ler("fila_entradas", r.data.entradas[0]));
    checar("ou coloca na sequência da fila agora", ok(r) && naFila && naFila.origem === "app" && naFila.status === "confirmado", r.data);
    await api("POST", `/api/lr/fila/${naFila.id}/cancelar`, { token: gerente.token, body: { motivo: "teste" } });
    r = await api("POST", "/api/lr/agendar", { token: c2.token, body: { slug: A.slug, servico: simples.id, veiculos: [vOutro.id], horario: amanha.toISOString() } });
    const ag4 = r.data;
    r = await api("POST", `/api/lr/agendamentos/${ag4.id}/responder`, { token: gerente.token, body: { como: "recusar", resposta: "Fechado nesse dia" } });
    checar("ou recusa com o motivo", ok(r) && r.data.status === "recusado", r.data);
    r = await api("GET", `/api/collections/agendamentos/records?filter=${qs(`empresa="${A.id}"`)}`, { token: c1.token });
    checar("cada cliente vê só os pedidos dele", ok(r) && r.data.items.every((x) => x.cliente === c1.id), r.data && r.data.items.length);

    console.log("\nOrçamento (polimento): a equipe responde antes de qualquer valor");
    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: polimento.id, veiculos: [v1.id] } });
    checar("serviço sob orçamento não entra direto na fila", negado(r), r.data);
    r = await api("POST", "/api/collections/orcamentos/records", {
      token: c1.token,
      form: formulario({ empresa: A.id, cliente: c1.id, veiculo: v1.id, servico: polimento.id, descricao: "Polimento, tem riscos na porta", status: "pedido", valor: "1" }, [["fotos", PNG, "risco.png", "image/png"]]),
    });
    checar("cliente pede orçamento com foto", ok(r) && r.data.status === "pedido" && r.data.valor === 0 && r.data.fotos.length === 1, r.data);
    const orc = r.data;
    r = await api("POST", "/api/collections/orcamentos/records", { token: c1.token, body: { empresa: A.id, cliente: c1.id, veiculo: vOutro.id, descricao: "teste", status: "pedido" } });
    checar("não pede orçamento para carro de outra pessoa", negado(r), r.status);
    r = await api("POST", `/api/lr/orcamentos/${orc.id}/decidir`, { token: c1.token, body: { aceitar: true } });
    checar("cliente não aceita antes da equipe responder", negado(r), r.data);
    r = await api("POST", `/api/lr/orcamentos/${orc.id}/responder`, { token: resp.token, body: { valor: 350, duracao_min: 240, resposta: "Polimento técnico" } });
    checar("responsável pela fila não dá preço (só dono e gerente)", negado(r), r.status);
    r = await api("POST", `/api/lr/orcamentos/${orc.id}/responder`, { token: gerente.token, body: { valor: 350, duracao_min: 240, resposta: "Polimento técnico, 4h", validade_dias: 7 } });
    checar("gerente responde o valor", ok(r), r.data);
    r = await api("GET", `/api/collections/orcamentos/records/${orc.id}`, { token: c2.token });
    checar("outro cliente não vê o orçamento", negado(r), r.status);
    r = await api("POST", `/api/lr/orcamentos/${orc.id}/decidir`, { token: c1.token, body: { aceitar: true } });
    checar("cliente aceita", ok(r) && r.data.status === "aceito", r.data);
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: polimento.id, veiculos: [v2.id], horario: amanha.toISOString(), orcamento: orc.id } });
    checar("o orçamento vale só para o carro dele", negado(r), r.data);
    r = await api("POST", "/api/lr/agendar", { token: c1.token, body: { slug: A.slug, servico: polimento.id, veiculos: [v1.id], horario: amanha.toISOString(), orcamento: orc.id } });
    checar("com o orçamento aceito, pede o horário", r.status === 201, r.data);
    r = await api("POST", `/api/lr/agendamentos/${r.data.id}/responder`, { token: gerente.token, body: { como: "no_horario" } });
    const ePol = r.data.entradas && (await ler("fila_entradas", r.data.entradas[0]));
    checar("na fila entra com o valor e o tempo do orçamento", ePol && ePol.preco_servico === 350 && ePol.duracao_min === 240, ePol && [ePol.preco_servico, ePol.duracao_min]);
    await api("POST", `/api/lr/fila/${ePol.id}/cancelar`, { token: gerente.token, body: { motivo: "teste" } });

    console.log("\nDashboard mostra a fidelização");
    r = await api("GET", `/api/lr/relatorio/${A.id}`, { token: patrao.token });
    const fz = r.data && r.data.fidelizacao;
    checar("dashboard traz planos vendidos, lavagens por plano, prêmios e orçamentos", fz && fz.planos_vendidos === 1 && fz.planos_valor === 120 && fz.lavagens_plano === 2 && fz.orcamentos_aceitos === 1, fz);
    checar("dashboard traz carros por tipo", Array.isArray(r.data.por_tipo) && r.data.por_tipo.length >= 1, r.data.por_tipo);
  } finally {
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
