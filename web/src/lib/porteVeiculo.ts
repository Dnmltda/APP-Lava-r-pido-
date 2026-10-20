import type { Porte, TipoVeiculo, Veiculo, Vinculo } from "./tipos";

// Tamanho do carro: o cliente informa uma vez no cadastro do carro e o preço sai sozinho.
export const PORTES: { id: Porte; nome: string; exemplos: string }[] = [
  { id: "pequeno", nome: "Pequeno", exemplos: "hatch: HB20, Onix, Gol, Argo" },
  { id: "medio", nome: "Médio", exemplos: "sedan e SUV: Corolla, Compass, Creta" },
  { id: "grande", nome: "Grande", exemplos: "caminhonete e van: Hilux, S10, Ranger" },
  { id: "moto", nome: "Moto", exemplos: "" },
];
export const nomePorte = (p?: string) => PORTES.find((x) => x.id === p)?.nome || "";

// Modelos mais comuns no Brasil → porte. É só uma sugestão: o cliente pode trocar.
const MODELOS: Record<Porte, string[]> = {
  pequeno: [
    "hb20", "onix", "gol", "argo", "mobi", "kwid", "polo", "up", "sandero", "fox", "palio", "uno", "celta", "corsa", "prisma",
    "fiesta", "ka", "ford ka", "etios", "march", "208", "c3", "yaris", "fit", "picanto", "clio", "agile", "punto", "spin",
    "logan", "voyage", "versa", "cronos", "virtus", "city", "hb20s", "onix plus", "joy", "uno way", "kwid outsider",
  ],
  medio: [
    "corolla", "civic", "cruze", "jetta", "sentra", "compass", "renegade", "creta", "t-cross", "tcross", "nivus", "kicks", "hr-v", "hrv", "tracker",
    "duster", "ecosport", "pulse", "fastback", "taos", "tiguan", "captur", "2008", "3008", "c4", "rav4", "corolla cross", "commander", "territory",
    "sportage", "tucson", "ix35", "outlander", "asx", "wr-v", "wrv", "fusion", "golf", "a3", "a4", "320i", "classe c", "kardian", "basalt",
  ],
  grande: [
    "hilux", "s10", "ranger", "amarok", "l200", "triton", "frontier", "toro", "maverick", "ram", "rampage", "sw4", "trailblazer", "pajero",
    "master", "sprinter", "ducato", "daily", "jumper", "boxer", "transit", "expert", "partner", "kombi", "doblo", "kangoo", "tiggo 8", "f-250", "f250", "titano",
  ],
  moto: [
    "cg", "fan", "titan", "biz", "pop", "bros", "xre", "cb", "fazer", "factor", "lander", "nmax", "pcx", "elite", "start", "crosser", "xtz",
    "mt-03", "mt03", "ninja", "z400", "twister", "hornet", "africa", "neo", "fluo", "lead", "burgman", "dk", "yes",
  ],
};
// Picapes pequenas (Strada, Saveiro, Montana, Oroch) ficam de fora: cada lava rápido cobra de um
// jeito, então o próprio cliente escolhe o tamanho.

export function sugerirPorte(modelo: string): Porte | "" {
  const m = ` ${modelo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, " ").trim()} `;
  if (m.trim().length < 2) return "";
  let melhor: { porte: Porte; tam: number } | null = null;
  for (const porte of Object.keys(MODELOS) as Porte[]) {
    for (const nome of MODELOS[porte]) {
      if (m.includes(` ${nome} `) && (!melhor || nome.length > melhor.tam)) melhor = { porte, tam: nome.length };
    }
  }
  return melhor ? melhor.porte : "";
}

// Mesma regra do servidor (lib.tipoDoCarro): equipe > motorista de app > porte do cadastro.
export function tipoDoCarro(tipos: TipoVeiculo[], vinculo: Vinculo | null, veiculo: Veiculo | undefined): { tipo?: TipoVeiculo; motivo: string } {
  if (!veiculo) return { motivo: "" };
  const daEquipe = tipos.find((t) => t.id === vinculo?.tipos_veiculos?.[veiculo.id]);
  if (daEquipe) return { tipo: daEquipe, motivo: "definido pelo lava rápido" };
  const app = tipos.find((t) => t.vale === "app");
  if (veiculo.app_motorista && app) return { tipo: app, motivo: "motorista de aplicativo" };
  const porte = veiculo.porte && tipos.find((t) => t.vale === veiculo.porte);
  if (porte) return { tipo: porte, motivo: "pelo tamanho do carro" };
  return { motivo: "" };
}
