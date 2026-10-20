#!/usr/bin/env node
// Teste da Etapa 6: avisos no celular (Web Push) e avaliação do cliente.
//
// Sem celular aqui, o teste faz o papel do "serviço de push" e do "celular":
// sobe um servidor HTTP local como endpoint de inscrição, gera as chaves do
// aparelho e DESCRIPTOGRAFA cada notificação (RFC 8291, aes128gcm), além de
// conferir a assinatura VAPID (RFC 8292), igual Android/iPhone fazem.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-avisos.mjs

import crypto from "node:crypto";
import http from "node:http";

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const deB64u = (s) => Buffer.from(s, "base64url");

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

// ------------------------------------------------------ "celular" de teste
function novoAparelho() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, publica: ecdh.getPublicKey(), auth: crypto.randomBytes(16) };
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// RFC 8291: descriptografa o corpo aes128gcm com as chaves do aparelho.
function descriptografar(aparelho, corpo) {
  const salt = corpo.subarray(0, 16);
  const idlen = corpo[20];
  const asPublica = corpo.subarray(21, 21 + idlen);
  const cifrado = corpo.subarray(21 + idlen);
  const segredo = aparelho.ecdh.computeSecret(asPublica);
  const prkKey = hmac(aparelho.auth, segredo);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), aparelho.publica, asPublica]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
  const decifra = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decifra.setAuthTag(cifrado.subarray(cifrado.length - 16));
  let texto = Buffer.concat([decifra.update(cifrado.subarray(0, cifrado.length - 16)), decifra.final()]);
  let fim = texto.length - 1;
  while (fim >= 0 && texto[fim] === 0) fim--; // tira o enchimento
  texto = texto.subarray(0, fim); // tira o delimitador 0x02
  return JSON.parse(texto.toString("utf8"));
}

// RFC 8292: confere o cabeçalho "vapid t=JWT, k=chave" com a chave pública do servidor.
function vapidValido(cabecalho, chavePublicaServidor, origem) {
  const m = /vapid t=([^,]+),\s*k=(.+)/.exec(cabecalho || "");
  if (!m || m[2].trim() !== chavePublicaServidor) return false;
  const [h, p, s] = m[1].split(".");
  const raw = deB64u(chavePublicaServidor);
  const chave = crypto.createPublicKey({
    key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) },
    format: "jwk",
  });
  const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: chave, dsaEncoding: "ieee-p1363" }, deB64u(s));
  const claims = JSON.parse(deB64u(p).toString());
  return ok && claims.aud === origem && claims.exp * 1000 > Date.now() && String(claims.sub).startsWith("mailto:");
}

// ------------------------------------------- "serviço de push" de teste
const recebidas = [];
const respostaPorId = {};
const servidor = http.createServer((req, res) => {
  const partes = [];
  req.on("data", (c) => partes.push(c));
  req.on("end", () => {
    const id = req.url.split("/").pop();
    recebidas.push({ id, headers: req.headers, corpo: Buffer.concat(partes), em: Date.now() });
    res.writeHead(respostaPorId[id] || 201);
    res.end();
  });
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const ORIGEM = `http://127.0.0.1:${servidor.address().port}`;

async function esperarPush(aparelho, id, quando, ms = 8000) {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    const p = recebidas.find((x) => x.id === id && x.em >= quando);
    if (p) return { ...p, msg: descriptografar(aparelho, p.corpo) };
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function esperarTitulo(aparelho, id, quando, prefixo, ms) {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    for (const x of recebidas.filter((y) => y.id === id && y.em >= quando)) {
      const msg = descriptografar(aparelho, x.corpo);
      if (msg.title.startsWith(prefixo)) return { ...x, msg };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
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
      nome, celular: "114" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token };
  };

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Avisos", slug: "teste-av-" + sufixo, ativo: true, capacidade_simultanea: 2, aviso_min: 15 });
    const B = await criar("empresas", { nome: "Teste Avisos B", slug: "teste-avb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão A", A, "patrao");
    const func = await pessoa("João Lavador", A, "funcionario");
    const resp = await pessoa("Resp A", A, "funcionario", { responsavel_fila: true });
    const c1 = await pessoa("Ana Cliente", A, "cliente");
    const c2 = await pessoa("Bia Cliente", A, "cliente");
    const funcB = await pessoa("Func B", B, "funcionario");
    const servico = await criar("servicos", { empresa: A.id, nome: "Completa", preco: 70, duracao_media_min: 50, ativo: true });
    const v1 = await criar("veiculos", { cliente: c1.usuario.id, final_placa: "AN1", ativo: true });
    const v2 = await criar("veiculos", { cliente: c2.usuario.id, final_placa: "BI2", ativo: true });

    // ------------------------------------------------------- inscrição
    console.log("\nInscrição para receber avisos");
    let r = await api("GET", "/api/lr/push/chave");
    checar("servidor publica a chave VAPID", r.status === 200 && deB64u(r.data.publica).length === 65, r.data);
    const CHAVE = r.data.publica;
    const ap1 = novoAparelho();
    const ap2 = novoAparelho();
    const inscrever = (p, ap, id) =>
      api("POST", "/api/collections/push_inscricoes/records", {
        token: p.token,
        body: { usuario: p.usuario.id, endpoint: `${ORIGEM}/push/${id}`, p256dh: b64u(ap.publica), auth: b64u(ap.auth), dispositivo: "teste" },
      });
    r = await inscrever(c1, ap1, "ana");
    checar("cliente inscreve o próprio celular", r.status === 200, r.data);
    await inscrever(c2, ap2, "bia");
    r = await api("POST", "/api/collections/push_inscricoes/records", {
      token: c1.token, body: { usuario: c2.usuario.id, endpoint: `${ORIGEM}/push/x`, p256dh: b64u(ap1.publica), auth: b64u(ap1.auth) },
    });
    checar("não inscreve aparelho em nome de outra pessoa", negado(r), r.status);
    r = await api("GET", "/api/collections/push_inscricoes/records", { token: c2.token });
    checar("cada um vê só as próprias inscrições", r.data.items.length === 1 && r.data.items[0].usuario === c2.usuario.id);
    r = await api("GET", "/api/collections/push_chaves/records", { token: patrao.token });
    checar("ninguém lê a chave privada do servidor", negado(r) || r.data.items.length === 0, r.status);

    // ------------------------------------------------- avisos da fila
    console.log("\nAvisos no celular");
    r = await api("POST", "/api/lr/fila/entrar", { token: c1.token, body: { slug: A.slug, servico: servico.id, veiculo: v1.id } });
    const e1 = r.data.id;
    let t0 = Date.now();
    await api("POST", `/api/lr/fila/${e1}/confirmar`, { token: resp.token });
    let p = await esperarPush(ap1, "ana", t0);
    checar("'Sua vez foi confirmada' chega e descriptografa no aparelho", p && p.msg.title.startsWith("Vez confirmada") && p.msg.body.includes("Lava Teste Avisos") && p.msg.body.includes("Previsão"), p && p.msg);
    checar("formato Web Push padrão (aes128gcm, TTL, urgência)", p && p.headers["content-encoding"] === "aes128gcm" && Number(p.headers.ttl) > 0 && p.headers.urgency === "high", p && p.headers);
    checar("assinatura VAPID válida (RFC 8292)", p && vapidValido(p.headers.authorization, CHAVE, ORIGEM), p && p.headers.authorization);
    checar("link abre o lava rápido certo", p && p.msg.url === `/${A.slug}`, p && p.msg.url);

    t0 = Date.now();
    await api("POST", `/api/lr/fila/${e1}/avisar`, { token: func.token });
    p = await esperarPush(ap1, "ana", t0);
    checar("botão 'Avisar' também manda 'Já pode vir' no app", p && p.msg.title.startsWith("Já pode vir") && p.msg.body.includes("Faltam 15 minutos"), p && p.msg);

    console.log("\nAviso automático (a cada minuto, quando faltam 15 min)");
    r = await api("POST", "/api/lr/fila/entrar", { token: c2.token, body: { slug: A.slug, servico: servico.id, veiculo: v2.id } });
    const e2 = r.data.id;
    t0 = Date.now();
    await api("POST", `/api/lr/fila/${e2}/confirmar`, { token: resp.token });
    p = await esperarTitulo(ap2, "bia", t0, "Já pode vir", 75000);
    checar("sem ninguém tocar em nada, 'Já pode vir' chega sozinho", !!p, p && p.msg);
    await new Promise((res) => setTimeout(res, 61000)); // espera mais uma rodada do aviso automático
    const repetidos = recebidas.filter((x) => x.id === "bia" && x.em >= t0).map((x) => descriptografar(ap2, x.corpo).title).filter((t) => t.startsWith("Já pode vir")).length;
    checar("o aviso automático não se repete", repetidos === 1, repetidos);

    console.log("\nPronto e avaliação");
    await api("POST", `/api/lr/fila/${e1}/chegou`, { token: func.token });
    await api("POST", `/api/lr/fila/${e1}/iniciar`, { token: func.token });
    await api("PATCH", `/api/collections/empresas/records/${A.id}`, {
      token: patrao.token, body: { textos_aviso: { pronto: "Tá brilhando, {empresa}! Pode buscar." } },
    });
    t0 = Date.now();
    await api("POST", `/api/lr/fila/${e1}/pronto`, { token: func.token });
    p = await esperarPush(ap1, "ana", t0);
    checar("'Carro pronto' usa o texto configurado pelo patrão", p && p.msg.body === "Tá brilhando, Lava Teste Avisos! Pode buscar.", p && p.msg);
    t0 = Date.now();
    await api("POST", `/api/lr/fila/${e1}/finalizar`, { token: func.token, body: { lavado_por: func.usuario.id } });
    p = await esperarPush(ap1, "ana", t0);
    checar("depois da baixa: 'Como foi sua lavagem?' com link para avaliar", p && p.msg.title.startsWith("Como foi") && p.msg.url === `/${A.slug}/avaliar/${e1}`, p && p.msg);

    console.log("\nInscrição expirada");
    respostaPorId.bia = 410;
    await api("POST", `/api/lr/fila/${e2}/avisar`, { token: func.token });
    await new Promise((res) => setTimeout(res, 800));
    r = await api("GET", "/api/collections/push_inscricoes/records", { token: c2.token });
    checar("aparelho que desinstalou (410) é removido sozinho", r.data.items.length === 0, r.data.items.length);

    // ------------------------------------------------------- avaliação
    console.log("\nAvaliação");
    r = await api("GET", `/api/lr/avaliacao-pendente/${A.slug}`, { token: c1.token });
    checar("app sabe que há uma lavagem para avaliar", r.data.entrada === e1, r.data);
    r = await api("GET", `/api/lr/avaliacao/${e1}`, { token: c1.token });
    checar("tela de avaliar mostra serviço e primeiro nome de quem lavou", r.data.servico === "Completa" && r.data.funcionario === "João", r.data);
    r = await api("POST", "/api/lr/avaliar", { token: c1.token, body: { entrada: e1, nota_funcionario: 6, nota_atendimento: 5, nota_ambiente: 5 } });
    checar("nota fora de 1 a 5 é recusada", r.status === 400, r.status);
    r = await api("POST", "/api/lr/avaliar", { token: c2.token, body: { entrada: e1, nota_funcionario: 5, nota_atendimento: 5, nota_ambiente: 5 } });
    checar("outro cliente não avalia a lavagem alheia", r.status === 404, r.status);
    r = await api("POST", "/api/lr/avaliar", { token: c2.token, body: { entrada: e2, nota_funcionario: 5, nota_atendimento: 5, nota_ambiente: 5 } });
    checar("não avalia antes da baixa", r.status === 400, r.status);
    r = await api("POST", "/api/lr/avaliar", {
      token: c1.token, body: { entrada: e1, nota_funcionario: 5, nota_atendimento: 4, nota_ambiente: 3, comentario: "Ficou ótimo" },
    });
    checar("cliente avalia funcionário, atendimento e ambiente", r.status === 201, r.data);
    r = await api("POST", "/api/lr/avaliar", { token: c1.token, body: { entrada: e1, nota_funcionario: 1, nota_atendimento: 1, nota_ambiente: 1 } });
    checar("só uma avaliação por lavagem", r.status === 400, r.status);
    r = await api("GET", `/api/lr/avaliacao-pendente/${A.slug}`, { token: c1.token });
    checar("depois de avaliar, não pede de novo", r.data.entrada === "", r.data);

    console.log("\nQuem vê as avaliações");
    r = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: func.token });
    checar("equipe vê a avaliação e as médias", r.status === 200 && r.data.total === 1 && r.data.media.geral === 4, r.data);
    checar("equipe NÃO vê o nome do cliente", !JSON.stringify(r.data).includes("Ana") && !("cliente" in r.data.lista[0]), r.data.lista[0]);
    r = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: patrao.token });
    checar("patrão vê com o nome do cliente", r.data.lista[0]?.cliente === "Ana Cliente", r.data.lista[0]);
    r = await api("GET", `/api/lr/avaliacoes/${A.id}?funcionario=eu`, { token: func.token });
    checar("'minhas avaliações' do funcionário", r.data.total === 1 && r.data.lista[0].funcionario === "João", r.data);
    r = await api("GET", `/api/lr/avaliacoes/${A.id}?funcionario=eu`, { token: resp.token });
    checar("outro funcionário não tem avaliações dele", r.data.total === 0);
    r = await api("GET", "/api/collections/avaliacoes/records", { token: func.token });
    checar("pela API direta a equipe não lê (evita ver o cliente)", r.data.items.length === 0);
    r = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: c1.token });
    checar("cliente não vê o painel de avaliações", r.status === 403, r.status);
    r = await api("GET", `/api/lr/avaliacoes/${A.id}`, { token: funcB.token });
    checar("outra empresa não vê", r.status === 403, r.status);

    console.log("\nLimpando dados de teste…");
    for (const col of ["auditoria", "fila_entradas"]) {
      const lista = await api("GET", `/api/collections/${col}/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
      for (const x of lista.data.items) await api("DELETE", `/api/collections/${col}/records/${x.id}`, { token: ADM });
    }
  } finally {
    // Empresa primeiro (leva junto lavagens, vendas e histórico do teste), depois as pessoas.
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
    servidor.close();
  }

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  servidor.close();
  process.exit(1);
});
