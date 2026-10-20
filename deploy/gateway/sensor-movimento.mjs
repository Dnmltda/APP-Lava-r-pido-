#!/usr/bin/env node
// Sensor de movimento: roda no computadorzinho da loja (o mesmo do go2rtc/MediaMTX).
//
// Fica escutando os eventos de "detecção de movimento" do DVR/NVR e avisa o app.
// Só funciona se a câmera/DVR tiver detecção de movimento ligada (no próprio DVR).
// A cada minuto manda um "sinal" para o app saber que o sensor está funcionando.
//
//   node sensor-movimento.mjs config.json
//
// config.json:
// {
//   "servidor": "https://seu-lava-rapido.com.br",
//   "dvrs": [
//     { "marca": "intelbras", "endereco": "http://192.168.1.10", "usuario": "admin", "senha": "…",
//       "cameras": { "1": "CHAVE-DO-SENSOR-DA-CAMERA-1", "2": "CHAVE-…" } },
//     { "marca": "hikvision", "endereco": "http://192.168.1.20", "usuario": "admin", "senha": "…",
//       "cameras": { "1": "CHAVE-…" } }
//   ]
// }
// A chave de cada câmera aparece no app: Câmeras → Editar → Sensor de movimento.
// marca: "intelbras" (ou "dahua") | "hikvision". Número da câmera = canal do DVR (1, 2, 3…).
// Sem dependências: só Node.js 18+.

import crypto from "node:crypto";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync(process.argv[2] || "config.json", "utf8"));
const SERVIDOR = String(config.servidor || "").replace(/\/+$/, "");
const INTERVALO_SINAL_MS = (config.intervalo_sinal_s || 60) * 1000;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- app
async function avisarApp(chave, tipo) {
  try {
    const r = await fetch(`${SERVIDOR}/api/lr/sensor/${chave}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status !== 204) log("app respondeu", r.status, "para", tipo);
  } catch (err) {
    log("app fora do ar:", err.message);
  }
}

// ------------------------------------------------- autenticação Digest
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

function cabecalhoDigest(desafio, metodo, uri, usuario, senha) {
  const p = {};
  for (const m of desafio.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) p[m[1].toLowerCase()] = m[2] ?? m[3];
  const ha1 = md5(`${usuario}:${p.realm}:${senha}`);
  const ha2 = md5(`${metodo}:${uri}`);
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const qop = p.qop ? p.qop.split(",")[0].trim() : "";
  const resposta = qop ? md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
  let h = `Digest username="${usuario}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${resposta}"`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (p.opaque) h += `, opaque="${p.opaque}"`;
  return h;
}

async function abrirComLogin(url, usuario, senha, sinal) {
  let r = await fetch(url, { signal: sinal });
  if (r.status !== 401) return r;
  const desafio = r.headers.get("www-authenticate") || "";
  await r.body?.cancel();
  const u = new URL(url);
  const auth = /^digest/i.test(desafio)
    ? cabecalhoDigest(desafio, "GET", u.pathname + u.search, usuario, senha)
    : "Basic " + Buffer.from(`${usuario}:${senha}`).toString("base64");
  r = await fetch(url, { headers: { Authorization: auth }, signal: sinal });
  return r;
}

// --------------------------------------------------- leitura de eventos
// Intelbras/Dahua: "Code=VideoMotion;action=Start;index=0"  (index começa em 0)
function eventosDahua(texto) {
  const canais = [];
  for (const m of texto.matchAll(/Code=(VideoMotion|CrossLineDetection|CrossRegionDetection|SmartMotionHuman)\s*;\s*action=Start\s*;\s*index=(\d+)/gi)) {
    canais.push(String(parseInt(m[2], 10) + 1));
  }
  return canais;
}

// Hikvision: blocos <EventNotificationAlert> com eventType VMD (movimento) e eventState active.
function eventosHikvision(texto) {
  const canais = [];
  for (const m of texto.matchAll(/<EventNotificationAlert[\s\S]*?<\/EventNotificationAlert>/gi)) {
    const xml = m[0];
    const tipo = (/<eventType>([^<]*)<\/eventType>/i.exec(xml) || [])[1] || "";
    const estado = (/<eventState>([^<]*)<\/eventState>/i.exec(xml) || [])[1] || "";
    const canal = (/<(?:channelID|dynChannelID)>(\d+)<\//i.exec(xml) || [])[1];
    if (canal && /^active$/i.test(estado) && /^(VMD|fielddetection|linedetection|regionEntrance)$/i.test(tipo)) canais.push(String(parseInt(canal, 10)));
  }
  return canais;
}

const MARCAS = {
  intelbras: { caminho: "/cgi-bin/eventManager.cgi?action=attach&codes=[VideoMotion,CrossLineDetection,CrossRegionDetection]&heartbeat=5", ler: eventosDahua, corte: (b) => b.lastIndexOf("\n") + 1 },
  hikvision: { caminho: "/ISAPI/Event/notification/alertStream", ler: eventosHikvision, corte: (b) => {
    const i = b.lastIndexOf("</EventNotificationAlert>");
    return i < 0 ? 0 : i + "</EventNotificationAlert>".length;
  } },
};
MARCAS.dahua = MARCAS.intelbras;

// ------------------------------------------------------------- DVR
function vigiarDvr(dvr) {
  const marca = MARCAS[String(dvr.marca || "").toLowerCase()];
  if (!marca) {
    log("marca desconhecida:", dvr.marca, "(use intelbras, dahua ou hikvision)");
    return;
  }
  const chaves = dvr.cameras || {};
  const nome = dvr.endereco;
  const ultimoAviso = {};
  let conectado = false;

  // Sinal de vida: só enquanto a conexão com o DVR estiver de pé.
  const mandarSinal = () => {
    if (conectado) for (const chave of Object.values(chaves)) avisarApp(chave, "sinal");
  };
  setInterval(mandarSinal, INTERVALO_SINAL_MS);

  const conectar = async () => {
    try {
      const r = await abrirComLogin(String(dvr.endereco).replace(/\/+$/, "") + marca.caminho, dvr.usuario, dvr.senha);
      if (r.status !== 200) throw new Error("DVR respondeu " + r.status + (r.status === 401 ? " (usuário ou senha errados)" : ""));
      conectado = true;
      log("conectado ao DVR", nome);
      mandarSinal();
      let buffer = "";
      const decoder = new TextDecoder();
      for await (const pedaco of r.body) {
        buffer += decoder.decode(pedaco, { stream: true });
        // Processa só até o último bloco completo.
        const corte = marca.corte(buffer);
        if (corte <= 0) {
          if (buffer.length > 65536) buffer = buffer.slice(-16384);
          continue;
        }
        const completo = buffer.slice(0, corte);
        buffer = buffer.slice(corte).slice(-16384);
        for (const canal of marca.ler(completo)) {
          const chave = chaves[canal];
          if (!chave) continue;
          const agora = Date.now();
          if (agora - (ultimoAviso[canal] || 0) < 5000) continue;
          ultimoAviso[canal] = agora;
          log("movimento na câmera", canal, "do DVR", nome);
          avisarApp(chave, "movimento");
        }
      }
      throw new Error("conexão encerrada pelo DVR");
    } catch (err) {
      conectado = false;
      log("DVR", nome, "-", err.message, "- tentando de novo em 10 s");
      setTimeout(conectar, 10000);
    }
  };
  conectar();
}

if (!SERVIDOR || !Array.isArray(config.dvrs) || !config.dvrs.length) {
  console.error("config.json precisa de \"servidor\" e da lista \"dvrs\".");
  process.exit(2);
}
for (const dvr of config.dvrs) vigiarDvr(dvr);
log("sensor de movimento rodando para", config.dvrs.length, "DVR(s)");
