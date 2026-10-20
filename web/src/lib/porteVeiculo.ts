import type { Porte, TipoVeiculo, Veiculo, Vinculo } from "./tipos";

// Tamanho do carro: o cliente informa uma vez no cadastro do carro e o preço sai sozinho.
export const PORTES: { id: Porte; nome: string; exemplos: string }[] = [
  { id: "pequeno", nome: "Pequeno", exemplos: "hatch: HB20, Onix, Gol, Argo" },
  { id: "medio", nome: "Médio", exemplos: "sedan e SUV: Corolla, Compass, Creta" },
  { id: "grande", nome: "Grande", exemplos: "caminhonete e van: Hilux, S10, Ranger" },
  { id: "moto", nome: "Moto", exemplos: "" },
];
export const nomePorte = (p?: string) => PORTES.find((x) => x.id === p)?.nome || "";

// Modelos mais vendidos no Brasil → tamanho. O cliente escolhe o modelo e o tamanho vem junto.
// Picapes pequenas (Strada, Saveiro, Montana, Oroch) ficam de fora: cada lava rápido cobra de um
// jeito, então nelas o próprio cliente escolhe o tamanho.
const MODELOS: Record<Porte, string[]> = {
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
// Lista para o campo Modelo (sugestões enquanto digita).
export const MODELOS_CONHECIDOS = (Object.keys(MODELOS) as Porte[]).flatMap((porte) => MODELOS[porte].map((nome) => ({ nome, porte })));

const normal = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const junto = (t: string) => normal(t).replace(/ /g, "");

// Acha o modelo digitado ("hb20 1.0", "Hb 20", "corolla xei") na lista; o nome mais longo ganha
// ("Corolla Cross" antes de "Corolla").
export function acharModelo(modelo: string): { nome: string; porte: Porte } | null {
  const m = normal(modelo);
  const mj = junto(modelo);
  if (mj.length < 2) return null;
  let melhor: { nome: string; porte: Porte } | null = null;
  for (const x of MODELOS_CONHECIDOS) {
    const n = normal(x.nome);
    const nj = junto(x.nome);
    const casa = m.includes(n) || (nj.length >= 3 && mj.startsWith(nj));
    if (casa && (!melhor || nj.length > junto(melhor.nome).length)) melhor = x;
  }
  return melhor;
}

export function sugerirPorte(modelo: string): Porte | "" {
  return acharModelo(modelo)?.porte || "";
}

// Mesma regra do servidor (lib.tipoDoCarro): equipe > motorista de app > porte do cadastro.
export function tipoDoCarro(tipos: TipoVeiculo[], vinculo: Vinculo | null, veiculo: Veiculo | undefined): { tipo?: TipoVeiculo; motivo: string } {
  if (!veiculo) return { motivo: "" };
  const idEquipe = vinculo?.tipos_veiculos?.[veiculo.id];
  const daEquipe = idEquipe ? tipos.find((t) => t.id === idEquipe) : undefined;
  if (daEquipe) return { tipo: daEquipe, motivo: "definido pelo lava rápido" };
  const app = tipos.find((t) => t.vale === "app");
  if (veiculo.app_motorista && app) return { tipo: app, motivo: "motorista de aplicativo" };
  const porte = veiculo.porte && tipos.find((t) => t.vale === veiculo.porte);
  if (porte) return { tipo: porte, motivo: "pelo tamanho do carro" };
  return { motivo: "" };
}
