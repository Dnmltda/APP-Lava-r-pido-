import type { ReactNode } from "react";

// Peças do painel. Números sempre em texto (cor de tinta); a cor da marca só
// aparece nas barras. Barras: um tom só (a marca) sobre um trilho mais claro.

export function NumeroPrincipal({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-linha bg-white p-5 shadow-sm">
      <p className="text-base font-semibold text-tinta-suave">{rotulo}</p>
      <p className="mt-1 text-5xl font-black leading-none tracking-tight text-tinta">{valor}</p>
      {detalhe && <div className="mt-3 text-base text-tinta-suave">{detalhe}</div>}
    </div>
  );
}

export function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${alerta ? "border-red-300" : "border-linha"}`}>
      <p className="text-sm font-semibold text-tinta-suave">{rotulo}</p>
      <p className={`mt-1 text-2xl font-extrabold leading-tight ${alerta ? "text-red-700" : "text-tinta"}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-sm text-tinta-suave">{detalhe}</p>}
    </div>
  );
}

// Progresso contra uma meta: preenchimento na cor da marca, trilho mais claro da mesma cor.
export function BarraMeta({ rotulo, realizado, meta, formatar }: { rotulo: string; realizado: number; meta: number; formatar: (v: number) => string }) {
  const pct = meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold text-tinta">{rotulo}</span>
        <span className="text-base text-tinta">
          <strong>{formatar(realizado)}</strong>
          {meta > 0 ? <span className="text-tinta-suave"> de {formatar(meta)} · {Math.round((realizado / meta) * 100)}%</span> : <span className="text-tinta-suave"> · sem meta</span>}
        </span>
      </div>
      <div
        className="mt-2 h-3 overflow-hidden rounded-full bg-marca-suave"
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-marca transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Lista ordenada com barra fina proporcional ao maior valor (uma série, um tom).
export function ListaComBarras({
  itens,
  vazio,
}: {
  itens: { chave: string; rotulo: string; valor: number; texto: string; detalhe?: string }[];
  vazio: string;
}) {
  if (!itens.length) return <p className="text-base text-tinta-suave">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ol className="flex flex-col gap-3">
      {itens.map((i, n) => (
        <li key={i.chave} title={`${i.rotulo}: ${i.texto}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-base text-tinta">
              <span className="mr-2 font-bold text-tinta-suave tabular-nums">{n + 1}º</span>
              <strong>{i.rotulo}</strong>
              {i.detalhe && <span className="text-tinta-suave"> · {i.detalhe}</span>}
            </span>
            <span className="shrink-0 text-base font-bold text-tinta tabular-nums">{i.texto}</span>
          </div>
          <div className="mt-1.5 h-2 rounded bg-marca-suave">
            <div className="h-2 rounded bg-marca" style={{ width: `${Math.max(2, (i.valor / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Bloco({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-linha bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-tinta">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}
