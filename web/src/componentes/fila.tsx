import type { ReactNode } from "react";
import { useFlip } from "../lib/animacao";
import { emQuanto, hora, NOME_STATUS, type FilaPublica, type ItemPublico } from "../lib/fila";
import type { StatusFila } from "../lib/tipos";

// Cores fixas de status (seção 4 do planejamento).
const COR_STATUS: Record<StatusFila, string> = {
  pendente: "bg-amber-100 text-amber-900 border-amber-300",
  confirmado: "bg-blue-100 text-blue-900 border-blue-300",
  avisado: "bg-blue-100 text-blue-900 border-blue-300",
  no_local: "bg-sky-100 text-sky-900 border-sky-300",
  lavando: "bg-purple-100 text-purple-900 border-purple-300",
  pronto: "bg-green-100 text-green-900 border-green-300",
  finalizado: "bg-gray-100 text-gray-700 border-gray-300",
  recusado: "bg-gray-100 text-gray-700 border-gray-300",
  cancelado: "bg-gray-100 text-gray-700 border-gray-300",
  substituido: "bg-gray-100 text-gray-700 border-gray-300",
};

export function ChipStatus({ status }: { status: StatusFila }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-sm font-bold ${COR_STATUS[status]}`}>
      {NOME_STATUS[status]}
    </span>
  );
}

export function IconeBusca({ className = "" }: { className?: string }) {
  return (
    <span title="Pediu busca do carro" className={`inline-flex min-h-7 items-center gap-1 rounded-full bg-orange-100 px-2.5 text-sm font-bold text-orange-900 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M5 17h14M6 17l1.5-5h9L18 17M7 17v2M17 17v2M8.5 12l1-3h5l1 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Busca
    </span>
  );
}

function Linha({ item, agora, children }: { item: ItemPublico; agora: string; children?: ReactNode }) {
  return (
    <li
      data-flip={item.id}
      className={`flex items-center gap-3 rounded-2xl border bg-white px-3 py-3 ${item.status === "pronto" ? "brilho-pronto" : ""} ${item.minha ? "border-2 border-marca shadow-md" : "border-linha"} ${item.reservado && !item.minha ? "border-dashed" : ""}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black ${item.minha ? "bg-marca text-sobre-marca" : "bg-fundo text-tinta"}`}>
        {item.posicao ?? "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-tinta">
          {item.nome}
          {item.final_placa && <span className="ml-2 font-mono text-tinta-suave">…{item.final_placa}</span>}
          {item.minha && <span className="ml-2 text-sm font-bold text-marca-forte">(você)</span>}
        </span>
        <span className="block text-sm text-tinta-suave">
          {children ?? (item.previsao ? `Previsão ${hora(item.previsao)} · ${emQuanto(item.previsao, agora)}` : item.servico)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {item.reservado && !item.minha ? (
          <span className="rounded-full border border-dashed border-tinta-suave px-2.5 py-0.5 text-sm font-bold text-tinta-suave">Reservado</span>
        ) : (
          <ChipStatus status={item.status} />
        )}
      </span>
    </li>
  );
}

// Fila pública: o que qualquer pessoa vê (primeiro nome + final da placa).
export function ListaFilaPublica({ fila }: { fila: FilaPublica }) {
  // Quando um carro avança (ou muda de seção), os cartões deslizam até o lugar novo.
  const ordem = [...fila.lavando, ...fila.fila, ...fila.prontos].map((i) => `${i.id}:${i.status}`).join(",");
  const ref = useFlip<HTMLDivElement>(ordem);
  return (
    <div ref={ref} className="flex flex-col gap-5">
      {fila.lavando.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">Lavando agora</h3>
          <ul className="flex flex-col gap-2">
            {fila.lavando.map((i) => (
              <Linha key={i.id} item={i} agora={fila.agora}>
                {i.servico}
                {i.inicio_em ? ` · desde ${hora(i.inicio_em)}` : ""}
              </Linha>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">
          Na fila {fila.fila.length > 0 && `(${fila.fila.length})`}
        </h3>
        {fila.fila.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-linha px-4 py-6 text-center text-base text-tinta-suave">
            Fila vazia. Quem chegar agora é atendido logo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fila.fila.map((i) => (
              <Linha key={i.id} item={i} agora={fila.agora} />
            ))}
          </ul>
        )}
      </section>
      {fila.prontos.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">Prontos para retirar</h3>
          <ul className="flex flex-col gap-2">
            {fila.prontos.map((i) => (
              <Linha key={i.id} item={i} agora={fila.agora}>
                {i.servico}
              </Linha>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
