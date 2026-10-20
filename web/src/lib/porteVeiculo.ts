import { useEffect, useState } from "react";
import { pb } from "./pb";
import type { Porte, TipoVeiculo, Veiculo, Vinculo } from "./tipos";

// Tamanho do carro: o cliente informa uma vez no cadastro do carro e o preço sai sozinho.
export const PORTES: { id: Porte; nome: string; exemplos: string }[] = [
  { id: "pequeno", nome: "Pequeno", exemplos: "hatch: HB20, Onix, Gol, Argo" },
  { id: "medio", nome: "Médio", exemplos: "sedan e SUV: Corolla, Compass, Creta" },
  { id: "grande", nome: "Grande", exemplos: "caminhonete e van: Hilux, S10, Ranger" },
  { id: "moto", nome: "Moto", exemplos: "" },
];
export const nomePorte = (p?: string) => PORTES.find((x) => x.id === p)?.nome || "";

// Lista de modelos e tamanhos: vem do servidor (fonte única, pb_hooks/modelos.js). O cliente não
// escolhe o tamanho: o servidor grava pelo modelo; aqui é só para mostrar enquanto ele digita.
export interface ModeloConhecido {
  nome: string;
  porte: Porte;
}
let cacheModelos: Promise<ModeloConhecido[]> | null = null;
export function useModelos() {
  const [lista, setLista] = useState<ModeloConhecido[]>([]);
  useEffect(() => {
    cacheModelos ||= pb.send<ModeloConhecido[]>("/api/lr/modelos", { method: "GET" }).catch(() => {
      cacheModelos = null;
      return [];
    });
    let vivo = true;
    cacheModelos.then((l) => vivo && setLista(l));
    return () => {
      vivo = false;
    };
  }, []);
  return lista;
}

const normal = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const junto = (t: string) => normal(t).replace(/ /g, "");

// Mesmo algoritmo do servidor: "hb20 1.0", "Hb 20", "corolla xei"; o nome mais longo ganha.
export function acharModelo(lista: ModeloConhecido[], modelo: string): ModeloConhecido | null {
  const m = normal(modelo);
  const mj = junto(modelo);
  if (mj.length < 2) return null;
  let melhor: ModeloConhecido | null = null;
  for (const x of lista) {
    const nj = junto(x.nome);
    const casa = m.includes(normal(x.nome)) || (nj.length >= 3 && mj.startsWith(nj));
    if (casa && (!melhor || nj.length > junto(melhor.nome).length)) melhor = x;
  }
  return melhor;
}

export function textoPorte(p?: string) {
  if (!p) return "";
  return p === "moto" ? "Moto" : `Carro ${nomePorte(p).toLowerCase()}`;
}

// Mesma regra do servidor (lib.tipoDoCarro): o que a equipe/dono definiu > tamanho do cadastro.
// Motorista de app só vale depois que o dono aprova o carro (a 1ª lavagem sai pelo preço normal).
export function tipoDoCarro(
  tipos: TipoVeiculo[],
  vinculo: Vinculo | null,
  veiculo: Veiculo | undefined,
): { tipo?: TipoVeiculo; motivo: string; appPendente: boolean } {
  if (!veiculo) return { motivo: "", appPendente: false };
  const idEquipe = vinculo?.tipos_veiculos?.[veiculo.id];
  const daEquipe = idEquipe ? tipos.find((t) => t.id === idEquipe) : undefined;
  const app = tipos.find((t) => t.vale === "app");
  const appPendente = !!veiculo.app_motorista && !!app && idEquipe !== app.id && idEquipe !== "recusado";
  if (daEquipe) return { tipo: daEquipe, motivo: daEquipe.vale === "app" ? "motorista de app aprovado" : "definido pelo lava rápido", appPendente };
  const porte = veiculo.porte && tipos.find((t) => t.vale === veiculo.porte);
  if (porte) return { tipo: porte, motivo: "pelo tamanho do carro", appPendente };
  return { motivo: "", appPendente };
}
