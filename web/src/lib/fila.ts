import { useCallback, useEffect, useRef, useState } from "react";
import { pb, mensagemDeErro } from "./pb";
import type { Base, Servico, StatusFila, Usuario, Veiculo } from "./tipos";

export interface ItemPublico {
  id: string;
  status: StatusFila;
  reservado: boolean;
  nome: string;
  final_placa: string;
  servico: string;
  quer_busca: boolean;
  minha: boolean;
  posicao?: number;
  previsao?: string;
  inicio_em?: string;
}

export interface FilaPublica {
  empresa: string;
  agora: string;
  capacidade: number;
  proxima_vaga: string;
  lavando: ItemPublico[];
  fila: ItemPublico[];
  prontos: ItemPublico[];
}

export interface EntradaFila extends Base {
  empresa: string;
  cliente: string;
  veiculo: string;
  servico: string;
  origem: "app" | "reserva" | "balcao" | "substituicao";
  ordem: number;
  status: StatusFila;
  quer_busca: boolean;
  observacao: string;
  nome_avulso: string;
  celular_avulso: string;
  final_placa_avulsa: string;
  veiculo_avulso: string;
  duracao_min: number;
  preco_servico: number;
  confirmado_em: string;
  avisado_em: string;
  chegada_em: string;
  inicio_em: string;
  pronto_em: string;
  finalizado_em: string;
  lavado_por: string;
  motivo: string;
  expand?: { cliente?: Usuario; veiculo?: Veiculo; servico?: Servico };
}

export const STATUS_ESPERA: StatusFila[] = ["pendente", "confirmado", "avisado", "no_local"];
export const STATUS_ATIVOS: StatusFila[] = [...STATUS_ESPERA, "lavando", "pronto"];

export const NOME_STATUS: Record<StatusFila, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  avisado: "Avisado",
  no_local: "No local",
  lavando: "Lavando",
  pronto: "Pronto",
  finalizado: "Finalizado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  substituido: "Substituído",
};

// Fila ao vivo: carrega a visão pública e recarrega sozinha quando o sinal de
// tempo real da empresa muda (e a cada minuto, para atualizar as previsões).
// Com `completa`, a equipe também recebe as entradas com nome, placa e serviço.
export function useFilaAoVivo(slug: string, empresaId: string, completa = false) {
  const [publica, setPublica] = useState<FilaPublica | null>(null);
  const [entradas, setEntradas] = useState<EntradaFila[] | null>(null);
  const [erro, setErro] = useState("");
  const emAndamento = useRef(false);
  const pendente = useRef(false);

  const carregar = useCallback(async () => {
    if (emAndamento.current) {
      pendente.current = true;
      return;
    }
    emAndamento.current = true;
    try {
      const [p, e] = await Promise.all([
        pb.send<FilaPublica>(`/api/lr/fila-publica/${encodeURIComponent(slug)}`, { method: "GET" }),
        completa
          ? pb.collection("fila_entradas").getFullList<EntradaFila>({
              filter: pb.filter(
                "empresa = {:e} && (" + STATUS_ATIVOS.map((s) => `status = "${s}"`).join(" || ") + ")",
                { e: empresaId },
              ),
              sort: "ordem",
              expand: "cliente,veiculo,servico",
            })
          : Promise.resolve(null),
      ]);
      setPublica(p);
      if (completa) setEntradas(e);
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível carregar a fila."));
    } finally {
      emAndamento.current = false;
      if (pendente.current) {
        pendente.current = false;
        carregar();
      }
    }
  }, [slug, empresaId, completa]);

  useEffect(() => {
    carregar();
    let desligar: (() => void) | undefined;
    let ativo = true;
    pb.collection("fila_sinais")
      .subscribe("*", () => carregar(), { filter: pb.filter("empresa = {:e}", { e: empresaId }) })
      .then((fn) => {
        if (ativo) desligar = fn;
        else fn();
      })
      .catch(() => {});
    const relogio = window.setInterval(carregar, 60_000);
    const aoVoltar = () => document.visibilityState === "visible" && carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", carregar);
    return () => {
      ativo = false;
      desligar?.();
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", carregar);
    };
  }, [carregar, empresaId]);

  return { publica, entradas, erro, recarregar: carregar };
}

export async function acaoFila(entradaId: string, acao: string, body?: Record<string, unknown>) {
  return pb.send<{ id: string; status: StatusFila }>(`/api/lr/fila/${entradaId}/${acao}`, { method: "POST", body });
}

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function hora(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  return isNaN(d.getTime()) ? "" : FMT_HORA.format(d);
}

// "agora", "em ~15 min", "em ~1h20"
export function emQuanto(iso: string | undefined, agoraIso?: string) {
  if (!iso) return "";
  const diff = Math.round((Date.parse(iso) - (agoraIso ? Date.parse(agoraIso) : Date.now())) / 60000);
  if (diff <= 1) return "agora";
  if (diff < 60) return `em ~${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `em ~${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

export function nomeDaEntrada(e: EntradaFila) {
  return e.expand?.cliente?.nome || e.nome_avulso || "Cliente";
}

export function placaDaEntrada(e: EntradaFila) {
  const v = e.expand?.veiculo;
  if (v) return v.placa || `…${v.final_placa}`;
  return e.final_placa_avulsa ? `…${e.final_placa_avulsa}` : "";
}

export function veiculoDaEntrada(e: EntradaFila) {
  const v = e.expand?.veiculo;
  if (v) return [v.modelo, v.cor].filter(Boolean).join(" · ");
  return e.veiculo_avulso;
}

export function celularDaEntrada(e: EntradaFila) {
  return e.expand?.cliente?.celular || e.celular_avulso || "";
}
