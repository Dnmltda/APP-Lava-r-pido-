// Modelos mais vendidos no Brasil → tamanho (pequeno | medio | grande | moto).
// Fonte única: o app busca esta lista em GET /api/lr/modelos e o servidor usa a mesma para gravar
// o tamanho do carro (o cliente não escolhe o tamanho). Picapes pequenas (Strada, Saveiro, Montana,
// Oroch) ficam de fora de propósito: cada lava rápido cobra de um jeito, e a equipe define.
const MODELOS = {
  pequeno: [
    "HB20", "HB20S", "Onix", "Onix Plus", "Gol", "Voyage", "Polo", "Virtus", "Up", "Fox", "Argo", "Cronos", "Mobi", "Uno", "Palio", "Siena",
    "Grand Siena", "Punto", "Kwid", "Sandero", "Logan", "Clio", "Ka", "Ka Sedan", "Fiesta", "Etios", "Yaris", "Yaris Sedan", "March", "Versa",
    "208", "207", "C3", "Fit", "City", "Celta", "Prisma", "Corsa", "Classic", "Agile", "Picanto", "Spin", "Dolphin", "Dolphin Mini",
  ],
  medio: [
    "Corolla", "Corolla Cross", "Civic", "Cruze", "Jetta", "Sentra", "Compass", "Renegade", "Commander", "Creta", "T-Cross", "Nivus", "Taos",
    "Tiguan", "Kicks", "HR-V", "WR-V", "ZR-V", "CR-V", "Tracker", "Equinox", "Duster", "Captur", "Ecosport", "Territory", "Pulse", "Fastback",
    "2008", "3008", "C4 Cactus", "Basalt", "Aircross", "RAV4", "Sportage", "Tucson", "ix35", "Outlander", "ASX", "Eclipse Cross", "Fusion",
    "Golf", "A3", "A4", "Q3", "320i", "X1", "Classe A", "Classe C", "GLA", "Song Plus", "Yuan Plus", "Seal", "Haval H6", "Tiggo 5x", "Tiggo 7", "Kardian",
  ],
  grande: [
    "Hilux", "SW4", "S10", "Trailblazer", "Ranger", "Amarok", "L200", "Triton", "Frontier", "Toro", "Maverick", "Rampage", "Ram 1500", "Ram 2500",
    "Pajero", "Tiggo 8", "Master", "Sprinter", "Ducato", "Daily", "Jumper", "Boxer", "Transit", "Expert", "Partner", "Doblò", "Kangoo", "Kombi",
    "F-250", "Titano", "Hoggar",
  ],
  moto: [
    "CG 160", "CG 150", "CG 125", "Fan", "Titan", "Start", "Biz", "Pop 110", "Bros", "XRE 300", "XRE 190", "CB 300", "CB 500", "Twister",
    "Hornet", "Fazer 250", "Fazer 150", "Factor", "Lander", "Crosser", "XTZ", "NMax", "PCX", "Elite", "Lead", "Neo", "Fluo", "Burgman",
    "MT-03", "MT-07", "Ninja", "Z400", "Africa Twin", "Sahara",
  ],
};

const LISTA = [];
for (const porte of Object.keys(MODELOS)) for (const nome of MODELOS[porte]) LISTA.push({ nome: nome, porte: porte });

function normal(t) {
  return " " + String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";
}
function junto(t) {
  return normal(t).replace(/ /g, "");
}
// Acha o modelo digitado ("hb20 1.0", "Hb 20", "corolla xei"); o nome mais longo ganha.
function acharModelo(modelo, lista) {
  const m = normal(modelo);
  const mj = junto(modelo);
  if (mj.length < 2) return null;
  let melhor = null;
  for (const x of lista || LISTA) {
    const nj = junto(x.nome);
    const casa = m.indexOf(normal(x.nome)) >= 0 || (nj.length >= 3 && mj.indexOf(nj) === 0);
    if (casa && (!melhor || nj.length > junto(melhor.nome).length)) melhor = x;
  }
  return melhor;
}

const PORTES = ["pequeno", "medio", "grande", "moto"];

// Ajustes do lava rápido (empresas.tamanhos_modelos): { "Strada": "medio" }.
function ajustesDaEmpresa(empresa) {
  let obj = {};
  try {
    obj = JSON.parse((empresa && empresa.getString("tamanhos_modelos")) || "{}") || {};
  } catch (_) {
    obj = {};
  }
  const out = {};
  if (typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj)) if (PORTES.indexOf(obj[k]) >= 0) out[k] = obj[k];
  return out;
}

// Lista do lava rápido: a lista padrão com os ajustes dele por cima (e modelos novos que ele incluiu).
function listaDaEmpresa(empresa) {
  const ajustes = ajustesDaEmpresa(empresa);
  const nomes = Object.keys(ajustes);
  if (!nomes.length) return LISTA;
  const porJunto = {};
  for (const n of nomes) porJunto[junto(n)] = n;
  const out = [];
  for (const x of LISTA) {
    const n = porJunto[junto(x.nome)];
    out.push(n ? { nome: x.nome, porte: ajustes[n], ajustado: true, padrao: x.porte } : x);
    if (n) delete porJunto[junto(x.nome)];
  }
  for (const j of Object.keys(porJunto)) out.push({ nome: porJunto[j], porte: ajustes[porJunto[j]], ajustado: true, padrao: "" });
  return out;
}

// Valida o que o dono mandou: { modelo: porte }, nomes curtos, no máximo 300 ajustes.
function limparAjustes(valor) {
  let obj = valor;
  // O corpo do pedido chega como mapa do servidor: vira objeto comum antes de conferir.
  try {
    if (obj && typeof obj !== "string") obj = JSON.parse(JSON.stringify(obj));
  } catch (_) {
    return null;
  }
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj || "{}");
    } catch (_) {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  const vistos = {};
  for (const k of Object.keys(obj)) {
    const nome = String(k).replace(/\s+/g, " ").trim();
    if (nome.length < 2 || nome.length > 40 || PORTES.indexOf(obj[k]) < 0) return null;
    if (vistos[junto(nome)]) continue;
    vistos[junto(nome)] = true;
    out[nome] = obj[k];
  }
  if (Object.keys(out).length > 300) return null;
  return out;
}

module.exports = { LISTA, PORTES, acharModelo, listaDaEmpresa, ajustesDaEmpresa, limparAjustes };
