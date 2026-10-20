import { CalendarClock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useEmpresa } from "../contexto/Empresa";
import { diaHora, linkWhatsApp } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import type { Agendamento } from "../lib/tipos";
import { descricaoVeiculo } from "./MeusVeiculos";
import { Aviso, Botao, Campo, Folha } from "./ui";

// Pedidos de horário feitos pelo cliente. Quem gere a fila responde: no horário pedido,
// em outro horário, na sequência da fila agora, ou recusa (com motivo).

const OFFSET = 3 * 3600000;
const paraCampo = (iso: string) => new Date(new Date(iso.replace(" ", "T")).getTime() - OFFSET).toISOString().slice(0, 16);
const localParaIso = (v: string) => new Date(`${v}:00-03:00`).toISOString();

export function PedidosHorario({ onMudou }: { onMudou: () => void }) {
  const { empresa } = useEmpresa();
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [aberto, setAberto] = useState<Agendamento | null>(null);
  const carregar = useCallback(async () => {
    try {
      setLista(
        await pb.collection("agendamentos").getFullList<Agendamento>({
          filter: pb.filter("empresa = {:e} && status = 'pedido'", { e: empresa.id }),
          sort: "horario_pedido",
          expand: "cliente,servico,veiculos",
        }),
      );
    } catch {
      // sem pedidos não atrapalha a fila
    }
  }, [empresa.id]);
  useEffect(() => {
    carregar();
    const t = window.setInterval(carregar, 30_000);
    return () => window.clearInterval(t);
  }, [carregar]);

  if (!lista.length) return null;
  return (
    <section className="mt-4 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4" aria-labelledby="titulo-horarios">
      <h2 id="titulo-horarios" className="flex items-center gap-2 text-lg font-extrabold text-tinta">
        <CalendarClock className="h-5 w-5" aria-hidden="true" /> Pedidos de horário ({lista.length})
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {lista.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setAberto(a)} className="w-full rounded-2xl bg-white p-3 text-left hover:ring-2 hover:ring-marca">
              <p className="text-base font-bold text-tinta">
                {a.expand?.cliente?.nome} · {diaHora(a.horario_pedido)}
              </p>
              <p className="text-sm text-tinta-suave">
                {a.expand?.servico?.nome} · {a.expand?.veiculos?.length || 0} {a.expand?.veiculos?.length === 1 ? "carro" : "carros"}
                {a.orcamento ? " · com orçamento aceito" : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {aberto && (
        <Responder
          pedido={aberto}
          onFechar={() => setAberto(null)}
          onFeito={() => {
            setAberto(null);
            carregar();
            onMudou();
          }}
        />
      )}
    </section>
  );
}

function Responder({ pedido, onFechar, onFeito }: { pedido: Agendamento; onFechar: () => void; onFeito: () => void }) {
  const [outro, setOutro] = useState(paraCampo(pedido.horario_pedido));
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState("");
  const cliente = pedido.expand?.cliente;
  async function responder(como: string) {
    setErro("");
    if (como === "recusar" && resposta.trim().length < 3) return setErro("Escreva o motivo para o cliente (ex.: fechado nesse dia).");
    setEnviando(como);
    try {
      await pb.send(`/api/lr/agendamentos/${pedido.id}/responder`, {
        method: "POST",
        body: { como, resposta: resposta.trim(), horario: como === "outro_horario" ? localParaIso(outro) : "" },
      });
      onFeito();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando("");
    }
  }
  return (
    <Folha titulo={`Pedido de ${cliente?.nome || "cliente"}`} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-fundo p-3 text-base text-tinta">
          <p>
            <strong>{pedido.expand?.servico?.nome}</strong> para <strong>{diaHora(pedido.horario_pedido)}</strong>
          </p>
          {pedido.expand?.veiculos?.map((v) => (
            <p key={v.id} className="text-sm">
              {descricaoVeiculo(v)}
            </p>
          ))}
          {pedido.observacao && <p className="mt-1">“{pedido.observacao}”</p>}
        </div>
        {cliente?.celular && (
          <a
            href={linkWhatsApp(cliente.celular, `Olá, ${cliente.nome.split(" ")[0]}! Sobre o seu pedido de horário no app:`)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-4 font-bold text-white"
          >
            Falar com o cliente no WhatsApp
          </a>
        )}
        <Campo rotulo="Recado para o cliente (opcional)" maxLength={300} placeholder="Ex.: traga o carro 10 min antes" value={resposta} onChange={(e) => setResposta(e.target.value)} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando === "no_horario"} disabled={!!enviando} onClick={() => responder("no_horario")}>
          Confirmar no horário pedido
        </Botao>
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-linha p-3">
          <Campo rotulo="Outro horário" type="datetime-local" value={outro} onChange={(e) => setOutro(e.target.value)} />
          <Botao variante="secundario" largo carregando={enviando === "outro_horario"} disabled={!!enviando} onClick={() => responder("outro_horario")}>
            Confirmar neste outro horário
          </Botao>
        </div>
        <Botao variante="secundario" largo carregando={enviando === "na_fila"} disabled={!!enviando} onClick={() => responder("na_fila")}>
          Colocar na sequência da fila agora
        </Botao>
        <Botao variante="perigo" largo carregando={enviando === "recusar"} disabled={!!enviando} onClick={() => responder("recusar")}>
          Recusar (escreva o motivo acima)
        </Botao>
      </div>
    </Folha>
  );
}
