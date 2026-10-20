#!/usr/bin/env node
// Teste da Etapa 7: câmeras (só o patrão).
//
// Sobe um "gateway" falso (como go2rtc/MediaMTX atrás de um túnel) que exige token,
// e confere que só o patrão da empresa vê as câmeras, que a imagem/vídeo passa pelo
// servidor com passe temporário e que o endereço e o token do gateway nunca chegam
// ao celular. O PocketBase precisa estar com LR_CAMERAS_LOCAL=1 (gateway em 127.0.0.1).
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-cameras.mjs

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

async function api(method, path, { token, body } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let data = null;
  try {
    data = JSON.parse(texto);
  } catch {}
  return { status: res.status, data, texto, headers: res.headers };
}
async function baixar(path) {
  const res = await fetch(PB + path);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, tipo: res.headers.get("content-type") || "", headers: res.headers };
}
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra) : ""));
  }
}
const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400;

// ------------------------------------------------------- gateway falso
const TOKEN_GW = "segredo-do-gateway-" + crypto.randomBytes(6).toString("hex");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(64), Buffer.from([0xff, 0xd9])]);
const SEGMENTO = crypto.randomBytes(188 * 4);
const pedidos = [];
const servidor = http.createServer((req, res) => {
  pedidos.push({ url: req.url, auth: req.headers.authorization || "" });
  if (req.headers.authorization !== "Bearer " + TOKEN_GW) {
    res.writeHead(401).end("sem token");
    return;
  }
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/frame.jpeg" && u.searchParams.get("src") === "box1") {
    res.writeHead(200, { "Content-Type": "image/jpeg" }).end(JPEG);
  } else if (u.pathname === "/box2/index.m3u8") {
    res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" }).end(
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg1.ts\n#EXTINF:2.0,\nparte/seg2.ts\n",
    );
  } else if (u.pathname === "/box2/seg1.ts" || u.pathname === "/box2/parte/seg2.ts") {
    res.writeHead(200, { "Content-Type": "video/mp2t" }).end(SEGMENTO);
  } else if (u.pathname === "/pagina.html") {
    res.writeHead(200, { "Content-Type": "text/html" }).end("<script>alert(1)</script>");
  } else {
    res.writeHead(404).end("não existe");
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const GW = `http://127.0.0.1:${servidor.address().port}`;

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", {
    body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD },
  });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body, token = ADM) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token, body });
    if (r.status !== 200) throw new Error(`Falha ao criar ${col}: ${r.texto}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  let seq = 0;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", {
      nome, celular: "115" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { usuario: u, vinculo: v, token: t.data.token };
  };

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Câmeras", slug: "teste-cam-" + sufixo, ativo: true });
    const B = await criar("empresas", { nome: "Teste Câmeras B", slug: "teste-camb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão A", A, "patrao");
    const gerente = await pessoa("Gerente A", A, "gerente");
    const func = await pessoa("Func A", A, "funcionario", { responsavel_fila: true });
    const cliente = await pessoa("Cliente A", A, "cliente");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const col = "/api/collections/cameras/records";

    // ------------------------------------------------------ cadastro
    console.log("\nCadastro (só o patrão)");
    let r = await api("POST", col, {
      token: patrao.token,
      body: { empresa: A.id, nome: "Box 1", tipo_integracao: "imagem", endereco_stream: GW, caminho: "/api/frame.jpeg?src=box1", gateway_token: TOKEN_GW, ativo: true, ordem: 1 },
    });
    checar("patrão cadastra câmera de imagem", r.status === 200, r.data);
    const cam1 = r.data;
    checar("token do gateway não volta na resposta", r.status === 200 && !("gateway_token" in cam1) && cam1.tem_token === true && !r.texto.includes(TOKEN_GW), r.data);
    checar("barra inicial do caminho é limpa", cam1.caminho === "api/frame.jpeg?src=box1", cam1.caminho);
    r = await api("POST", col, {
      token: patrao.token,
      body: { empresa: A.id, nome: "Box 2", tipo_integracao: "hls", endereco_stream: GW + "/", caminho: "box2/index.m3u8", gateway_token: TOKEN_GW, ativo: true, ordem: 2 },
    });
    checar("patrão cadastra câmera de vídeo (HLS)", r.status === 200, r.data);
    const cam2 = r.data;
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Intelbras", tipo_integracao: "app_fabricante", link_app: "https://www.intelbras.com/pt-br/", ativo: true } });
    checar("patrão cadastra botão do app do fabricante", r.status === 200, r.data);
    const cam3 = r.data;
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Demonstração", tipo_integracao: "demonstracao", ativo: true } });
    checar("patrão cadastra câmera de demonstração", r.status === 200, r.data);
    const cam4 = r.data;
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Sem caminho", tipo_integracao: "imagem", endereco_stream: GW, ativo: true } });
    checar("recusa câmera sem caminho", r.status === 400, r.data);
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Fora", tipo_integracao: "hls", endereco_stream: GW, caminho: "../segredo.m3u8", ativo: true } });
    checar("recusa caminho com '..'", r.status === 400, r.data);
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "App", tipo_integracao: "app_fabricante", link_app: "javascript:alert(1)", ativo: true } });
    checar("recusa link do app que não é https", r.status === 400, r.status);
    for (const [quem, p] of [["gerente", gerente], ["funcionário", func], ["cliente", cliente], ["patrão de outra empresa", patraoB]]) {
      r = await api("POST", col, { token: p.token, body: { empresa: A.id, nome: "X", tipo_integracao: "demonstracao", ativo: true } });
      checar(`${quem} não cadastra câmera`, negado(r), r.status);
    }
    r = await api("PATCH", `${col}/${cam1.id}`, { token: patrao.token, body: { empresa: B.id } });
    checar("não move câmera para outra empresa", negado(r), r.status);
    r = await api("PATCH", `${col}/${cam1.id}`, { token: patraoB.token, body: { nome: "Hack" } });
    checar("patrão de outra empresa não edita", negado(r), r.status);
    r = await api("GET", `${col}?filter=${encodeURIComponent(`gateway_token~"segredo"`)}`, { token: patrao.token });
    checar("não dá para descobrir o token filtrando", r.status === 400 || (r.data && r.data.items.length === 0), r.status);

    // -------------------------------------------------------- listar
    console.log("\nQuem vê as câmeras");
    r = await api("GET", `${col}?filter=${encodeURIComponent(`empresa="${A.id}"`)}&sort=ordem`, { token: patrao.token });
    checar("patrão vê as 4 câmeras", r.status === 200 && r.data.items.length === 4, r.data && r.data.items && r.data.items.length);
    checar("nenhuma traz o token do gateway", r.status === 200 && !r.texto.includes(TOKEN_GW));
    for (const [quem, p] of [["gerente", gerente], ["funcionário", func], ["cliente", cliente], ["patrão de outra empresa", patraoB]]) {
      r = await api("GET", `${col}?filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: p.token });
      checar(`${quem} não vê nenhuma câmera`, r.status === 200 && r.data.items.length === 0, r.data);
      r = await api("GET", `${col}/${cam1.id}`, { token: p.token });
      checar(`${quem} não abre a câmera pelo id`, negado(r), r.status);
      r = await api("POST", `/api/lr/cameras/${cam1.id}/acesso`, { token: p.token });
      checar(`${quem} não recebe passe`, negado(r), r.status);
    }
    r = await api("POST", `/api/lr/cameras/${cam1.id}/acesso`);
    checar("sem login não recebe passe", negado(r), r.status);

    // ---------------------------------------------------------- ver
    console.log("\nImagem e vídeo pelo servidor");
    r = await api("POST", `/api/lr/cameras/${cam1.id}/acesso`, { token: patrao.token });
    checar("patrão recebe passe temporário", r.status === 200 && r.data.url && r.data.expira_em_s === 600, r.data);
    checar("resposta não tem endereço nem token do gateway", !r.texto.includes(GW) && !r.texto.includes("127.0.0.1") && !r.texto.includes(TOKEN_GW), r.texto);
    const url1 = r.data.url;
    let b = await baixar(url1 + "?t=" + Date.now());
    checar("imagem chega igual à da câmera", b.status === 200 && b.tipo.startsWith("image/jpeg") && b.buf.equals(JPEG), b.status);
    checar("servidor usa o token no gateway", pedidos.at(-1).auth === "Bearer " + TOKEN_GW && pedidos.at(-1).url === "/api/frame.jpeg?src=box1", pedidos.at(-1));
    checar("resposta não fica em cache e não roda script", (b.headers.get("cache-control") || "").includes("no-store") && (b.headers.get("content-security-policy") || "").includes("default-src 'none'"));
    b = await baixar(url1 + "../../../_superusers");
    checar("passe não abre outros endereços", b.status !== 200 || !b.buf.equals(JPEG), b.status);
    b = await baixar(url1 + "outra.jpg");
    checar("câmera de imagem não aceita arquivo extra", b.status === 400, b.status);

    r = await api("POST", `/api/lr/cameras/${cam2.id}/acesso`, { token: patrao.token });
    const url2 = r.data.url;
    b = await baixar(url2);
    const playlist = b.buf.toString();
    checar("playlist HLS chega pelo servidor", b.status === 200 && b.tipo.includes("mpegurl") && playlist.includes("seg1.ts"), b.status);
    checar("playlist não revela o gateway", !playlist.includes(GW) && !playlist.includes("127.0.0.1"));
    b = await baixar(url2 + "seg1.ts");
    checar("pedaço do vídeo chega (caminho relativo)", b.status === 200 && b.buf.equals(SEGMENTO), b.status);
    b = await baixar(url2 + "parte/seg2.ts");
    checar("pedaço em subpasta também chega", b.status === 200 && b.buf.equals(SEGMENTO), b.status);
    b = await baixar(url2 + "nao-existe.ts");
    checar("arquivo inexistente vira erro 502 (sem detalhes do gateway)", b.status === 502 && !b.buf.toString().includes("127.0.0.1"), b.status);
    b = await baixar(url2 + "..%2F..%2Fpagina.html");
    checar("não sai da pasta do vídeo", b.status !== 200, b.status);

    r = await api("POST", `/api/lr/cameras/${cam3.id}/acesso`, { token: patrao.token });
    checar("app do fabricante devolve só o link", r.status === 200 && r.data.link === "https://www.intelbras.com/pt-br/" && !r.data.url, r.data);
    r = await api("POST", `/api/lr/cameras/${cam4.id}/acesso`, { token: patrao.token });
    b = await baixar(r.data.url);
    checar("câmera de demonstração mostra imagem com relógio", b.status === 200 && b.tipo.startsWith("image/svg+xml") && b.buf.toString().includes("DEMONSTRAÇÃO"), b.status);

    // ------------------------------------------------------ passes
    console.log("\nPasses falsos ou vencidos");
    const passe1 = url1.split("/ver/")[1].replace(/\/$/, "");
    b = await baixar(`/api/lr/cameras/${cam2.id}/ver/${passe1}/`);
    checar("passe de uma câmera não abre outra", b.status === 403, b.status);
    const [h, p] = passe1.split(".");
    const forjado = `${h}.${p}.${crypto.randomBytes(32).toString("base64url")}`;
    b = await baixar(`/api/lr/cameras/${cam1.id}/ver/${forjado}/`);
    checar("passe com assinatura falsa é recusado", b.status === 401, b.status);
    const semAss = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + p + ".";
    b = await baixar(`/api/lr/cameras/${cam1.id}/ver/${semAss}/`);
    checar("passe sem assinatura (alg none) é recusado", b.status === 401, b.status);
    const vencido = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), exp: Math.floor(Date.now() / 1000) - 10 })).toString("base64url");
    b = await baixar(`/api/lr/cameras/${cam1.id}/ver/${h}.${vencido}.${passe1.split(".")[2]}/`);
    checar("passe alterado (vencido) é recusado", b.status === 401, b.status);
    b = await baixar(`/api/lr/cameras/${cam1.id}/ver/qualquer-coisa/`);
    checar("sem passe válido não vê", b.status === 401, b.status);

    console.log("\nDesligar e tirar o acesso");
    await api("PATCH", `${col}/${cam1.id}`, { token: patrao.token, body: { ativo: false } });
    b = await baixar(url1);
    checar("câmera desativada para de mostrar na hora", b.status === 403, b.status);
    r = await api("POST", `/api/lr/cameras/${cam1.id}/acesso`, { token: patrao.token });
    checar("câmera desativada não dá passe", r.status === 400, r.status);
    r = await api("GET", `${col}/${cam1.id}`, { token: patrao.token });
    checar("editar sem mandar token mantém o token", r.data.tem_token === true, r.data);
    await api("PATCH", `/api/collections/vinculos/records/${patrao.vinculo.id}`, { token: ADM, body: { ativo: false } });
    b = await baixar(url2 + "seg1.ts");
    checar("patrão desligado perde o vídeo na hora, mesmo com passe", b.status === 403, b.status);
    await api("PATCH", `/api/collections/vinculos/records/${patrao.vinculo.id}`, { token: ADM, body: { ativo: true } });

    r = await api("GET", `/api/collections/servidor_segredos/records`, { token: patrao.token });
    checar("ninguém lê o segredo dos passes", negado(r) || r.data.items.length === 0, r.status);
    r = await api("GET", `/api/collections/auditoria/records?filter=${encodeURIComponent(`empresa="${A.id}" && acao~"camera"`)}&perPage=200`, { token: ADM });
    const acoes = (r.data.items || []).map((i) => i.acao);
    checar("auditoria registra cadastro, edição e visualização", acoes.includes("camera_criar") && acoes.includes("camera_editar") && acoes.includes("camera_ver"), acoes);
    checar("auditoria não guarda o token do gateway", !r.texto.includes(TOKEN_GW));

    r = await api("DELETE", `${col}/${cam3.id}`, { token: gerente.token });
    checar("gerente não exclui câmera", negado(r), r.status);
    r = await api("DELETE", `${col}/${cam3.id}`, { token: patrao.token });
    checar("patrão exclui câmera", r.status === 204, r.status);
  } finally {
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
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
