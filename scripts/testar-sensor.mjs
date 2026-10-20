#!/usr/bin/env node
// Teste do sensor de movimento das câmeras.
//
// Sobe dois DVRs falsos (Intelbras/Dahua e Hikvision, com login Digest de verdade),
// roda o programa do gateway (deploy/gateway/sensor-movimento.mjs) apontando para eles
// e confere: movimento chega ao app, área parada gera alerta só no horário de
// funcionamento, sensor sem sinal gera alerta, e só o patrão vê o histórico.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-sensor.mjs

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token, body } = {}) {
  const res = await fetch(PB + p, {
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
const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400;
async function ate(cond, ms = 8000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await cond();
    if (v) return v;
    await esperar(200);
  }
  return null;
}

// ----------------------------------------------------------- DVRs falsos
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
function dvrFalso(usuario, senha, caminho, tipo) {
  const conexoes = [];
  const realm = "DVR-" + tipo;
  const servidor = http.createServer((req, res) => {
    if (!req.url.startsWith(caminho)) return res.writeHead(404).end();
    const auth = req.headers.authorization || "";
    const nonce = "n" + crypto.randomBytes(8).toString("hex");
    const p = {};
    for (const m of auth.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) p[m[1]] = m[2] ?? m[3];
    const ha1 = md5(`${usuario}:${realm}:${senha}`);
    const ha2 = md5(`GET:${p.uri}`);
    const ok = /^Digest /.test(auth) && p.username === usuario && p.uri === req.url &&
      p.response === md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`);
    if (!ok) {
      res.writeHead(401, { "WWW-Authenticate": `Digest realm="${realm}", qop="auth", nonce="${nonce}", opaque="abc"` }).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "multipart/x-mixed-replace; boundary=myboundary" });
    res.write("--myboundary\r\n");
    conexoes.push(res);
  });
  return {
    servidor,
    conexoes,
    enviar(texto) {
      for (const c of conexoes) c.write(texto);
    },
  };
}
const dahua = dvrFalso("admin", "senhaDahua1", "/cgi-bin/eventManager.cgi", "dahua");
const hik = dvrFalso("admin", "senhaHik1", "/ISAPI/Event/notification/alertStream", "hik");
await new Promise((ok) => dahua.servidor.listen(0, "127.0.0.1", ok));
await new Promise((ok) => hik.servidor.listen(0, "127.0.0.1", ok));
const parteDahua = (index) => `--myboundary\r\nContent-Type: text/plain\r\nContent-Length: 40\r\n\r\nCode=VideoMotion;action=Start;index=${index}\r\n\r\n`;
const parteHik = (canal, estado, tipo = "VMD") =>
  `--myboundary\r\nContent-Type: application/xml\r\n\r\n<?xml version="1.0" encoding="UTF-8"?>\n<EventNotificationAlert version="2.0">\n<ipAddress>192.168.1.20</ipAddress>\n<channelID>${canal}</channelID>\n<eventType>${tipo}</eventType>\n<eventState>${estado}</eventState>\n</EventNotificationAlert>\r\n`;

let gateway;
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
  const SEMPRE_ABERTO = [0, 1, 2, 3, 4, 5, 6].map(() => ({ aberto: true, abre: "00:00", fecha: "23:59" }));
  const FECHADO = [0, 1, 2, 3, 4, 5, 6].map(() => ({ aberto: false, abre: "08:00", fecha: "18:00" }));
  const cam = async (id) => (await api("GET", `/api/collections/cameras/records/${id}`, { token: ADM })).data;
  const verificar = async () => (await api("POST", "/api/lr/sensor-verificar", { token: ADM })).data.alertas;
  const minutosAtras = (m) => new Date(Date.now() - m * 60000).toISOString().replace("T", " ");

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Lava Teste Sensor", slug: "teste-sen-" + sufixo, ativo: true, horario_funcionamento: SEMPRE_ABERTO });
    const B = await criar("empresas", { nome: "Teste Sensor B", slug: "teste-senb-" + sufixo, ativo: true });
    const patrao = await pessoa("Patrão A", A, "patrao");
    const gerente = await pessoa("Gerente A", A, "gerente");
    const func = await pessoa("Func A", A, "funcionario");
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const col = "/api/collections/cameras/records";

    console.log("\nCadastro do sensor");
    let r = await api("POST", col, {
      token: patrao.token,
      body: { empresa: A.id, nome: "Box 1", tipo_integracao: "app_fabricante", link_app: "https://exemplo.com.br", ativo: true, monitorar_movimento: true, sem_movimento_min: 10, chave_sensor: "x".repeat(40), ultimo_sinal_em: minutosAtras(1) },
    });
    const c1 = r.data;
    checar("patrão liga o sensor numa câmera", r.status === 200 && c1.monitorar_movimento === true, r.data);
    checar("servidor gera a chave secreta (não aceita a do celular)", /^[A-Za-z0-9]{40}$/.test(c1.chave_sensor) && c1.chave_sensor !== "x".repeat(40), c1.chave_sensor);
    checar("celular não inventa sinal do sensor", !c1.ultimo_sinal_em, c1.ultimo_sinal_em);
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Box 2", tipo_integracao: "app_fabricante", link_app: "https://exemplo.com.br", ativo: true, monitorar_movimento: true, sem_movimento_min: 30 } });
    const c2 = r.data;
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Box 3", tipo_integracao: "app_fabricante", link_app: "https://exemplo.com.br", ativo: true, monitorar_movimento: true } });
    const c3 = r.data;
    checar("tempo padrão sem movimento: 10 minutos", c3.sem_movimento_min === 10, c3.sem_movimento_min);
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Portão", tipo_integracao: "app_fabricante", link_app: "https://exemplo.com.br", ativo: true, monitorar_movimento: false } });
    const c4 = r.data;
    r = await api("PATCH", `${col}/${c1.id}`, { token: patrao.token, body: { chave_sensor: "y".repeat(40), ultimo_movimento_em: minutosAtras(0) } });
    checar("patrão não troca a chave nem o horário do movimento pela API", r.data.chave_sensor === c1.chave_sensor && !r.data.ultimo_movimento_em, r.data);

    r = await api("POST", "/api/lr/sensor/" + "Z".repeat(40), { body: { tipo: "movimento" } });
    checar("chave errada é recusada", r.status === 404, r.status);
    r = await api("POST", "/api/lr/sensor/curta", { body: { tipo: "movimento" } });
    checar("chave mal formada é recusada", r.status === 404, r.status);
    let al = await verificar();
    checar("câmera sem sensor conectado não gera alerta", !al.some((a) => [c1.id, c2.id, c3.id].includes(a.camera)), al);

    console.log("\nGateway da loja escutando os DVRs");
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "sensor-"));
    const cfg = path.join(pasta, "config.json");
    fs.writeFileSync(cfg, JSON.stringify({
      servidor: PB,
      dvrs: [
        { marca: "intelbras", endereco: `http://127.0.0.1:${dahua.servidor.address().port}`, usuario: "admin", senha: "senhaDahua1", cameras: { 1: c1.chave_sensor } },
        { marca: "hikvision", endereco: `http://127.0.0.1:${hik.servidor.address().port}`, usuario: "admin", senha: "senhaHik1", cameras: { 2: c2.chave_sensor } },
        { marca: "hikvision", endereco: `http://127.0.0.1:${hik.servidor.address().port}`, usuario: "admin", senha: "senhaErrada", cameras: { 5: c3.chave_sensor } },
      ],
    }));
    gateway = spawn(process.execPath, [path.join(RAIZ, "deploy/gateway/sensor-movimento.mjs"), cfg], { stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    gateway.stdout.on("data", (d) => (saida += d));
    gateway.stderr.on("data", (d) => (saida += d));

    let x = await ate(async () => (await cam(c1.id)).ultimo_sinal_em);
    checar("gateway entra no DVR Intelbras (login Digest) e manda sinal", !!x, saida);
    x = await ate(async () => (await cam(c2.id)).ultimo_sinal_em);
    checar("gateway entra no DVR Hikvision (login Digest) e manda sinal", !!x, saida);
    await esperar(800);
    checar("senha errada do DVR: sem sinal (não finge que funciona)", !(await cam(c3.id)).ultimo_sinal_em && /401/.test(saida), saida);

    dahua.enviar(parteDahua(0));
    x = await ate(async () => (await cam(c1.id)).ultimo_movimento_em);
    checar("movimento na câmera 1 do Intelbras chega ao app", !!x);
    dahua.enviar(parteDahua(3));
    hik.enviar(parteHik(2, "inactive"));
    await esperar(800);
    checar("câmera não cadastrada e movimento 'inativo' são ignorados", !(await cam(c2.id)).ultimo_movimento_em);
    hik.enviar(parteHik(2, "active"));
    x = await ate(async () => (await cam(c2.id)).ultimo_movimento_em);
    checar("movimento (VMD) na câmera 2 do Hikvision chega ao app", !!x);
    r = await api("GET", `/api/collections/camera_eventos/records?filter=${encodeURIComponent(`camera="${c1.id}"`)}`, { token: patrao.token });
    checar("histórico registra o movimento", r.status === 200 && r.data.items.some((i) => i.tipo === "movimento"), r.data);
    dahua.enviar(parteDahua(0));
    await esperar(6000);
    dahua.enviar(parteDahua(0));
    await esperar(800);
    r = await api("GET", `/api/collections/camera_eventos/records?filter=${encodeURIComponent(`camera="${c1.id}" && tipo="movimento"`)}`, { token: patrao.token });
    checar("movimento contínuo não enche o histórico (1 registro por período)", r.data.items.length === 1, r.data.items.length);

    console.log("\nQuem vê o sensor");
    for (const [quem, p] of [["gerente", gerente], ["funcionário", func], ["patrão de outra empresa", patraoB]]) {
      r = await api("GET", `/api/collections/camera_eventos/records?filter=${encodeURIComponent(`empresa="${A.id}"`)}`, { token: p.token });
      checar(`${quem} não vê o histórico de movimento`, r.status === 200 && r.data.items.length === 0, r.data);
    }
    r = await api("POST", "/api/collections/camera_eventos/records", { token: patrao.token, body: { empresa: A.id, camera: c1.id, tipo: "movimento" } });
    checar("ninguém grava movimento falso pela API", negado(r), r.status);

    console.log("\nÁrea parada → alerta ao patrão");
    al = await verificar();
    checar("sensor que acabou de conectar não alerta pelo passado", !al.some((a) => [c1.id, c2.id].includes(a.camera)), al);
    // Simula que o sensor está vigiando há 1 hora.
    await api("PATCH", `${col}/${c1.id}`, { token: ADM, body: { sensor_desde_em: minutosAtras(60), ultimo_movimento_em: minutosAtras(15) } });
    await api("PATCH", `${col}/${c2.id}`, { token: ADM, body: { sensor_desde_em: minutosAtras(60), ultimo_movimento_em: minutosAtras(15) } });
    await api("PATCH", `${col}/${c4.id}`, { token: ADM, body: { ultimo_sinal_em: minutosAtras(0), ultimo_movimento_em: minutosAtras(60) } });
    al = await verificar();
    const a1 = al.find((a) => a.camera === c1.id);
    checar("Box 1 parado há 15 min (limite 10) → alerta", a1 && a1.tipo === "parado" && a1.minutos >= 15, al);
    checar("Box 2 parado há 15 min (limite 30) → ainda não", !al.some((a) => a.camera === c2.id), al);
    checar("câmera com sensor desligado no app não alerta", !al.some((a) => a.camera === c4.id), al);
    al = await verificar();
    checar("alerta não se repete a cada minuto", !al.some((a) => a.camera === c1.id), al);
    r = await api("GET", `/api/collections/camera_eventos/records?filter=${encodeURIComponent(`camera="${c1.id}" && tipo="parado"`)}`, { token: patrao.token });
    checar("histórico registra 'sem movimento' com os minutos", r.data.items.length === 1 && r.data.items[0].minutos >= 15, r.data.items);
    dahua.enviar(parteDahua(0));
    await ate(async () => Date.now() - Date.parse((await cam(c1.id)).ultimo_movimento_em.replace(" ", "T")) < 60000);
    // Linha do tempo real: alerta há 20 min, mexeu há 12 min, parado desde então.
    await api("PATCH", `${col}/${c1.id}`, { token: ADM, body: { alerta_parado_em: minutosAtras(20), ultimo_movimento_em: minutosAtras(12) } });
    al = await verificar();
    checar("depois de mexer e parar de novo, alerta outra vez", al.some((a) => a.camera === c1.id && a.tipo === "parado"), al);

    await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: ADM, body: { horario_funcionamento: FECHADO } });
    await api("PATCH", `${col}/${c2.id}`, { token: ADM, body: { ultimo_movimento_em: minutosAtras(90) } });
    al = await verificar();
    checar("fora do horário de funcionamento não alerta", !al.some((a) => a.camera === c2.id), al);
    await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: ADM, body: { horario_funcionamento: null } });
    al = await verificar();
    checar("sem horário configurado não alerta (evita alerta de madrugada)", !al.some((a) => a.camera === c2.id), al);
    await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: ADM, body: { horario_funcionamento: SEMPRE_ABERTO } });
    al = await verificar();
    checar("no horário, Box 2 parado há 90 min (limite 30) → alerta", al.some((a) => a.camera === c2.id && a.tipo === "parado"), al);

    console.log("\nSensor sem sinal");
    gateway.kill();
    await api("PATCH", `${col}/${c1.id}`, { token: ADM, body: { ultimo_sinal_em: minutosAtras(6) } });
    al = await verificar();
    checar("sensor parou de mandar sinal há 6 min → alerta 'sem sinal'", al.some((a) => a.camera === c1.id && a.tipo === "desligado"), al);
    al = await verificar();
    checar("alerta 'sem sinal' não se repete", !al.some((a) => a.camera === c1.id), al);
    r = await api("POST", `/api/lr/sensor/${c1.chave_sensor}`, { body: { tipo: "sinal" } });
    checar("sensor volta (sinal) → aceito", r.status === 204, r.status);
    r = await api("GET", `/api/collections/camera_eventos/records?filter=${encodeURIComponent(`camera="${c1.id}"`)}&sort=-created`, { token: patrao.token });
    const tipos = r.data.items.map((i) => i.tipo);
    checar("histórico mostra 'sem sinal' e 'religado'", tipos.includes("desligado") && tipos[0] === "religado", tipos);

    console.log("\nCâmera de demonstração (sensor simulado)");
    r = await api("POST", col, { token: patrao.token, body: { empresa: A.id, nome: "Demo", tipo_integracao: "demonstracao", ativo: true, monitorar_movimento: true, sem_movimento_min: 1 } });
    const c5 = r.data;
    al = await verificar();
    checar("sensor simulado fica 'ligado' sozinho", !!(await cam(c5.id)).ultimo_sinal_em && !al.some((a) => a.camera === c5.id), al);
    await api("PATCH", `${col}/${c5.id}`, { token: ADM, body: { sensor_desde_em: minutosAtras(3) } });
    al = await verificar();
    checar("demo parada há mais de 1 min → alerta (para testar no celular)", al.some((a) => a.camera === c5.id && a.tipo === "parado"), al);
    r = await api("POST", `/api/lr/sensor/${c5.chave_sensor}`, { body: { tipo: "movimento" } });
    checar("botão 'simular movimento' (chave da câmera) registra movimento", r.status === 204 && !!(await cam(c5.id)).ultimo_movimento_em, r.status);

    console.log("\nTrocar a chave");
    r = await api("POST", `/api/lr/cameras/${c1.id}/nova-chave`, { token: gerente.token });
    checar("gerente não troca a chave", negado(r), r.status);
    r = await api("POST", `/api/lr/cameras/${c1.id}/nova-chave`, { token: patrao.token });
    const nova = r.data && r.data.chave_sensor;
    checar("patrão gera chave nova", r.status === 200 && /^[A-Za-z0-9]{40}$/.test(nova) && nova !== c1.chave_sensor, r.data);
    r = await api("POST", `/api/lr/sensor/${c1.chave_sensor}`, { body: { tipo: "movimento" } });
    checar("chave antiga para de funcionar", r.status === 404, r.status);
    r = await api("POST", `/api/lr/sensor/${nova}?tipo=movimento`);
    checar("chave nova funciona", r.status === 204, r.status);
  } finally {
    if (gateway) gateway.kill();
    // Empresa primeiro (leva junto lavagens, vendas e histórico do teste), depois as pessoas.
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
    for (const d of [dahua, hik]) {
      for (const c of d.conexoes) c.destroy();
      d.servidor.close();
    }
  }

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  if (gateway) gateway.kill();
  process.exit(1);
});
