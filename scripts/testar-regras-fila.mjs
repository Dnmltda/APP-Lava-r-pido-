#!/usr/bin/env node
// Teste da Etapa 3: "simular um dia com 15 carros e 5 reservas".
// Confere a cada passo as regras da seção 3.3 do planejamento:
//   ninguém fura a fila, reservas encaixadas sem atraso, tolerância,
//   reposicionar, cancelar, cancelar e substituir, fila atrasada mantém a sequência.
// Roda contra um PocketBase de DESENVOLVIMENTO (cria e apaga dados "teste-*").
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-regras-fila.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

const sufixo = Date.now().toString().slice(-6);
const MIN = 60000;
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
const iso = (ms) => new Date(ms).toISOString();
const pbData = (ms) => new Date(ms).toISOString().replace("T", " ");

// A ordem relativa de `antes` está preservada em `depois` (ignorando quem saiu)?
function mesmaSequencia(antes, depois) {
  const ficou = antes.filter((id) => depois.includes(id));
  const nova = depois.filter((id) => ficou.includes(id));
  return ficou.every((id, i) => nova[i] === id);
}

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
      nome, celular: "117" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token };
  };

  try {
    console.log("Preparando o lava rápido de teste (2 carros por vez, tolerância 10 min, aviso 15 min)…");
    const A = await criar("empresas", {
      nome: "Teste Regras", slug: "teste-rg-" + sufixo, ativo: true, capacidade_simultanea: 2, tolerancia_min: 10, aviso_min: 15,
    });
    const B = await criar("empresas", { nome: "Teste Regras B", slug: "teste-rgb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão", A, "patrao");
    const resp = await pessoa("Responsável", A, "funcionario", { responsavel_fila: true });
    const func = await pessoa("Funcionário", A, "funcionario");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const s30 = await criar("servicos", { empresa: A.id, nome: "Simples", preco: 40, duracao_media_min: 30, ativo: true });
    const s60 = await criar("servicos", { empresa: A.id, nome: "Completa", preco: 80, duracao_media_min: 60, ativo: true });
    const clientes = [];
    for (let i = 0; i < 6; i++) {
      const c = await pessoa(`Cliente${i + 1} Sobrenome`, A, "cliente");
      const v = await criar("veiculos", { cliente: c.usuario.id, final_placa: `C${i}${i}`, ativo: true });
      clientes.push({ ...c, veiculo: v });
    }
    const clienteReserva = await pessoa("Rita Reserva", A, "cliente");

    const publica = async (token) => (await api("GET", `/api/lr/fila-publica/${A.slug}`, { token })).data;
    const ids = (p) => p.fila.map((f) => f.id);

    // ------------------------------------------------------------ reservas
    console.log("\n5 horários reservados (antes do movimento do dia)");
    const agora = Date.now();
    const horarios = [60, 120, 180, 240, 300].map((m) => Math.ceil((agora + m * MIN) / MIN) * MIN);
    let r = await api("POST", "/api/lr/fila/reserva", {
      token: func.token, body: { empresa: A.id, horario: iso(horarios[0]), servico: s30.id },
    });
    checar("funcionário comum não cria reserva", r.status === 403, r.status);
    r = await api("POST", "/api/lr/fila/reserva", {
      token: patraoB.token, body: { empresa: A.id, horario: iso(horarios[0]), servico: s30.id },
    });
    checar("patrão de outra empresa não cria reserva", r.status === 403, r.status);
    r = await api("POST", "/api/lr/fila/reserva", {
      token: resp.token, body: { empresa: A.id, horario: iso(agora - 60 * MIN), servico: s30.id },
    });
    checar("não cria reserva no passado", r.status === 400, r.status);

    const reservas = [];
    for (const [i, h] of horarios.entries()) {
      r = await api("POST", "/api/lr/fila/reserva", {
        token: i % 2 ? patrao.token : resp.token,
        body: i === 0
          ? { empresa: A.id, horario: iso(h), servico: s30.id, nome: "Marcos Reserva Silva", final_placa: "R00" }
          : { empresa: A.id, horario: iso(h), servico: s30.id }, // dados preenchidos depois
      });
      checar(`reserva ${i + 1} criada para ${new Date(h).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`, r.status === 201, r.data);
      reservas.push({ id: r.data.id, horario: h });
    }
    let p = await publica();
    checar("público vê só 'Reservado', sem nome nem placa", p.fila.every((f) => f.nome === "Reservado" && f.final_placa === ""), p.fila);
    checar("reservas na ordem dos horários", ids(p).join() === reservas.map((x) => x.id).join());
    checar("previsão de cada reserva = horário reservado", p.fila.every((f, i) => Math.abs(Date.parse(f.previsao) - reservas[i].horario) < MIN), p.fila.map((f) => f.previsao));

    // ------------------------------------------------------ 15 carros no dia
    console.log("\n15 carros chegando (6 pelo app e 9 no balcão)");
    let regraNovo = true;
    let regraSequencia = true;
    let regraReservas = true;
    let regraNaoPassaNinguem = true;
    const entradas = [];
    for (let i = 0; i < 15; i++) {
      const antes = await publica();
      const idsAntes = ids(antes);
      const servico = i % 4 === 3 ? s60 : s30;
      if (i % 5 < 2 && clientes.length > entradas.filter((e) => e.app).length) {
        const c = clientes[entradas.filter((e) => e.app).length];
        r = await api("POST", "/api/lr/fila/entrar", {
          token: c.token, body: { slug: A.slug, servico: servico.id, veiculo: c.veiculo.id },
        });
        if (r.status !== 201) regraNovo = false;
        await api("POST", `/api/lr/fila/${r.data.id}/confirmar`, { token: resp.token });
        entradas.push({ id: r.data.id, app: true, cliente: c });
      } else {
        r = await api("POST", "/api/lr/fila/balcao", {
          token: resp.token, body: { empresa: A.id, servico: servico.id, nome: `Balcão ${i + 1}`, final_placa: `B${String(i).padStart(2, "0")}` },
        });
        if (r.status !== 201) regraNovo = false;
        entradas.push({ id: r.data.id, app: false });
      }
      const depois = await publica();
      const idsDepois = ids(depois);
      const novoId = entradas[entradas.length - 1].id;
      // 1) quem já estava continua na mesma sequência
      if (!mesmaSequencia(idsAntes, idsDepois)) regraSequencia = false;
      // 2) o novo nunca fica na frente de um cliente que não seja reserva
      const posNovo = idsDepois.indexOf(novoId);
      const naFrenteDoNovoDepois = idsDepois.slice(posNovo + 1);
      if (naFrenteDoNovoDepois.some((id) => !reservas.some((x) => x.id === id))) regraNaoPassaNinguem = false;
      // 3) nenhuma reserva atrasa por causa de quem entrou
      for (const f of depois.fila) {
        const res = reservas.find((x) => x.id === f.id);
        if (res && Date.parse(f.previsao) > res.horario + MIN) regraReservas = false;
      }
    }
    checar("os 15 carros entraram", regraNovo && entradas.length === 15);
    checar("ninguém fura a fila: quem já estava manteve a sequência a cada chegada", regraSequencia);
    checar("cliente novo só passa na frente de reserva futura (nunca de outro cliente)", regraNaoPassaNinguem);
    checar("nenhuma reserva foi atrasada por quem chegou depois", regraReservas);
    p = await publica();
    checar("fila com 20 (15 carros + 5 reservas)", p.fila.length === 20, p.fila.length);
    checar("posições contínuas 1..20", p.fila.every((f, i) => f.posicao === i + 1));
    const posReserva1 = ids(p).indexOf(reservas[0].id);
    checar("reserva das +60 min encaixada no meio do movimento (não no fim)", posReserva1 > 0 && posReserva1 < 19, posReserva1 + 1);
    checar("previsões nunca voltam no tempo ao longo da fila (2 vagas)", p.fila.every((f, i) => i < 2 || Date.parse(f.previsao) >= Date.parse(p.fila[i - 2].previsao)));

    // -------------------------------------------------- completar dados reserva
    console.log("\nDados da reserva preenchidos depois");
    r = await api("POST", `/api/lr/fila/${reservas[1].id}/dados`, {
      token: func.token, body: { nome: "X", celular: clienteReserva.usuario.celular, final_placa: "RR1" },
    });
    checar("funcionário comum não edita reserva", r.status === 403, r.status);
    r = await api("POST", `/api/lr/fila/${reservas[1].id}/dados`, {
      token: resp.token, body: { nome: "Rita Reserva", celular: clienteReserva.usuario.celular, final_placa: "rr1", veiculo_desc: "HB20 branco" },
    });
    checar("responsável completa nome, celular e placa", r.status === 200, r.data);
    p = await publica(clienteReserva.token);
    const daRita = p.fila.find((f) => f.id === reservas[1].id);
    checar("celular de cliente cadastrado liga a reserva à conta dela (ela vê como 'você')", daRita?.minha === true && daRita?.nome === "Rita" && daRita?.final_placa === "RR1", daRita);
    p = await publica();
    checar("para o público continua 'Reservado'", p.fila.find((f) => f.id === reservas[1].id)?.nome === "Reservado");
    r = await api("POST", `/api/lr/fila/${entradas[0].id}/dados`, { token: resp.token, body: { nome: "Hack" } });
    checar("não altera dados de quem entrou pelo app", r.status === 400 || !entradas[0].app, r.status);

    // ---------------------------------------------------------- tolerância
    console.log("\nTolerância de atraso (10 min)");
    p = await publica();
    const primeiro = p.fila[0].id;
    const segundo = p.fila[1].id;
    await api("POST", `/api/lr/fila/${primeiro}/avisar`, { token: func.token });
    // Avisado há 30 min: devia chegar há 15 (aviso de 15 min) → 5 min além da tolerância.
    await api("PATCH", `/api/collections/fila_entradas/records/${primeiro}`, { token: ADM, body: { avisado_em: pbData(Date.now() - 30 * MIN) } });
    p = await publica();
    checar("cliente avisado que passou da tolerância aparece como atrasado", p.fila[0].atrasado_min >= 4 && p.fila[0].atrasado_min <= 6, p.fila[0]);
    checar("quem não foi avisado não aparece como atrasado", !p.fila[1].atrasado_min, p.fila[1]);
    r = await api("POST", `/api/lr/fila/${segundo}/chegou`, { token: func.token });
    r = await api("POST", `/api/lr/fila/${segundo}/iniciar`, { token: func.token });
    checar("o próximo que está no local sobe e começa", r.status === 200, r.data);
    r = await api("GET", `/api/collections/auditoria/records?filter=${encodeURIComponent(`entidade_id="${segundo}" && acao="fila_iniciar"`)}`, { token: patrao.token });
    const aud = r.data.items[0]?.depois || {};
    checar("auditoria: passou atrasado, sem 'fora de ordem'", aud.passou_atrasados === 1 && !aud.fora_de_ordem, aud);
    p = await publica();
    checar("o atrasado não é punido: continua o 1º da fila", p.fila[0].id === primeiro);

    // --------------------------------------------------------- reposicionar
    console.log("\nReposicionar o atrasado ('chego em 60 min')");
    r = await api("POST", `/api/lr/fila/${primeiro}/reposicionar`, { token: func.token, body: { minutos: 60 } });
    checar("funcionário comum não reposiciona", r.status === 403, r.status);
    const antesRepos = ids(await publica());
    r = await api("POST", `/api/lr/fila/${primeiro}/reposicionar`, { token: resp.token, body: { minutos: 60, simular: true } });
    checar("app mostra a posição em que ele se encaixa antes de aplicar", r.status === 200 && r.data.nova_posicao > r.data.posicao_atual, r.data);
    const simulado = r.data;
    checar("simulação não muda nada", ids(await publica()).join() === antesRepos.join());
    r = await api("POST", `/api/lr/fila/${primeiro}/reposicionar`, { token: resp.token, body: { minutos: 60, motivo: "Ligou avisando" } });
    p = await publica();
    const novaPos = ids(p).indexOf(primeiro) + 1;
    checar("aplicado na posição mostrada", r.status === 200 && novaPos === simulado.nova_posicao, { novaPos, simulado });
    checar("continua na fila e com previsão depois da nova chegada", Date.parse(p.fila[novaPos - 1].previsao) >= Date.now() + 59 * MIN, p.fila[novaPos - 1]);
    checar("os outros mantêm a sequência", mesmaSequencia(antesRepos.filter((id) => id !== primeiro), ids(p)));
    checar("depois de reposicionar não aparece mais como atrasado", !p.fila[novaPos - 1].atrasado_min);
    const terceiro = p.fila[2].id;
    r = await api("POST", `/api/lr/fila/${terceiro}/reposicionar`, { token: resp.token, body: { minutos: 1, simular: true } });
    checar("reposicionar nunca leva para a frente", r.data.nova_posicao >= r.data.posicao_atual, r.data);

    // ------------------------------------------------------------- cancelar
    console.log("\nCancelar (a fila sobe)");
    p = await publica();
    const quinto = p.fila[4].id;
    const sexto = p.fila[5].id;
    r = await api("POST", `/api/lr/fila/${quinto}/cancelar`, { token: resp.token, body: { motivo: "Desistiu" } });
    p = await publica();
    checar("o 6º vira 5º", r.status === 200 && p.fila[4].id === sexto, p.fila.slice(3, 6).map((f) => f.id));
    r = await api("POST", `/api/lr/fila/${quinto}/substituir`, {
      token: resp.token, body: { servico: s30.id, nome: "Tarde Demais", final_placa: "TTT" },
    });
    checar("depois de cancelada sem substituição, a vaga não volta", r.status === 400, r.status);

    // ------------------------------------------------- cancelar e substituir
    console.log("\nCancelar e substituir (mesma posição)");
    p = await publica();
    const alvo = p.fila[2];
    r = await api("POST", `/api/lr/fila/${alvo.id}/substituir`, {
      token: func.token, body: { servico: s30.id, nome: "Zé Local", final_placa: "ZZZ" },
    });
    checar("funcionário comum não substitui", r.status === 403, r.status);
    r = await api("POST", `/api/lr/fila/${alvo.id}/substituir`, {
      token: resp.token, body: { servico: s60.id, nome: "Zé do Local", final_placa: "zz-9", veiculo_desc: "Saveiro", motivo: "Não respondeu" },
    });
    checar("substituição aceita", r.status === 201, r.data);
    const substituto = r.data.id;
    p = await publica();
    checar("substituto ocupa exatamente a mesma posição", p.fila[2].id === substituto && p.fila[2].posicao === alvo.posicao, p.fila[2]);
    checar("substituto já entra 'no local'", p.fila[2].status === "no_local");
    r = await api("GET", `/api/collections/fila_entradas/records/${alvo.id}`, { token: patrao.token });
    checar("a entrada antiga fica como 'substituído', ligada ao substituto", r.data.status === "substituido" && r.data.substituido_por === substituto, r.data);
    r = await api("POST", `/api/lr/fila/${alvo.id}/substituir`, { token: resp.token, body: { servico: s30.id, nome: "Outro", final_placa: "OOO" } });
    checar("não substitui duas vezes", r.status === 400, r.status);

    // ------------------------------------------ fila atrasada pela equipe
    console.log("\nFila atrasada por causa da equipe (mantém a sequência)");
    const seqAntes = ids(await publica());
    await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: ADM, body: { capacidade_simultanea: 1 } });
    p = await publica();
    checar("sequência idêntica: a reserva não passa na frente", ids(p).join() === seqAntes.join());
    const atrasadas = p.fila.filter((f) => reservas.some((x) => x.id === f.id && Date.parse(f.previsao) > x.horario + MIN));
    checar("o app recalcula e mostra as reservas com a nova previsão (atrasadas)", atrasadas.length > 0, atrasadas.length);

    // ------------------------------------------------------------ auditoria
    console.log("\nAuditoria");
    r = await api("GET", `/api/collections/auditoria/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: patrao.token });
    const acoes = new Set(r.data.items.map((a) => a.acao));
    checar("reserva, dados, reposicionar, cancelar e substituir registrados",
      ["fila_reserva", "fila_dados", "fila_reposicionar", "fila_cancelar", "fila_substituir"].every((a) => acoes.has(a)), [...acoes]);
    const repos = r.data.items.find((a) => a.acao === "fila_reposicionar");
    checar("reposicionamento guarda posição antes/depois e motivo", repos?.depois?.posicao_antes && repos?.depois?.posicao_depois && repos?.motivo === "Ligou avisando", repos);

    // ------------------------------------------------------------- limpeza
    console.log("\nLimpando dados de teste…");
    const audA = await api("GET", `/api/collections/auditoria/records?perPage=1000&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
    for (const a of audA.data.items) await api("DELETE", `/api/collections/auditoria/records/${a.id}`, { token: ADM });
    const fila = await api("GET", `/api/collections/fila_entradas/records?perPage=1000&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
    for (const f of fila.data.items) await api("DELETE", `/api/collections/fila_entradas/records/${f.id}`, { token: ADM });
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
