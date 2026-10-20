import { useId, useState, type ReactNode } from "react";

// Gráficos do dashboard. Regras: uma série = uma cor (a da marca), barras finas
// (≤ 24 px) com ponta arredondada de 4 px, grade em linha fina e discreta, números
// sempre na cor do texto, tooltip ao passar o dedo/mouse ou com o teclado, e
// "Ver tabela" em todo gráfico (nenhum valor depende só do tooltip).

export function maximoBonito(v: number) {
  if (v <= 0) return 1;
  const pot = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pot >= v) return m * pot;
  return 10 * pot;
}

export function compacto(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function CartaoGrafico({ titulo, subtitulo, children, tabela }: { titulo: string; subtitulo?: string; children: ReactNode; tabela?: ReactNode }) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:shadow-none">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-tinta">{titulo}</h2>
          {subtitulo && <p className="text-sm text-tinta-suave">{subtitulo}</p>}
        </div>
        {tabela && (
          <button
            type="button"
            onClick={() => setVerTabela((v) => !v)}
            aria-pressed={verTabela}
            className="min-h-10 shrink-0 rounded-lg px-2 text-sm font-bold text-marca-forte hover:bg-marca-suave print:hidden"
          >
            {verTabela ? "Ver gráfico" : "Ver tabela"}
          </button>
        )}
      </div>
      {verTabela ? tabela : children}
    </section>
  );
}

export interface PontoColuna {
  chave: string;
  rotulo: string; // rótulo curto no eixo
  rotuloLongo?: string; // título do tooltip
  valor: number;
  detalhes?: { nome: string; valor: string }[];
}

// Colunas verticais (uma série). Hover/foco em cada coluna mostra o tooltip.
export function Colunas({
  pontos,
  formatar,
  formatarEixo = compacto,
  altura = 176,
  destacarMaior = false,
}: {
  pontos: PontoColuna[];
  formatar: (v: number) => string;
  formatarEixo?: (v: number) => string;
  altura?: number;
  destacarMaior?: boolean;
}) {
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  const max = maximoBonito(Math.max(0, ...pontos.map((p) => p.valor)));
  const maior = pontos.reduce((m, p, i) => (p.valor > (pontos[m]?.valor ?? -1) ? i : m), 0);
  const passo = Math.max(1, Math.ceil(pontos.length / 8)); // no máx. ~8 rótulos no eixo
  const p = ativo !== null ? pontos[ativo] : null;

  return (
    <div className="relative" onPointerLeave={() => setAtivo(null)}>
      <div className="flex gap-2">
        {/* eixo Y: 0, metade e máximo */}
        <div className="flex shrink-0 flex-col justify-between text-right text-xs tabular-nums text-tinta-suave" style={{ height: altura }} aria-hidden="true">
          <span className="-translate-y-1/2">{formatarEixo(max)}</span>
          <span>{formatarEixo(max / 2)}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-linha/70" style={{ height: 0 }} aria-hidden="true" />
          <div className="absolute inset-x-0 border-t border-linha/70" style={{ top: altura / 2 }} aria-hidden="true" />
          <div className="absolute inset-x-0 border-t border-linha" style={{ top: altura }} aria-hidden="true" />
          <div className="relative flex items-end" style={{ height: altura }} role="list" aria-describedby={id}>
            {pontos.map((pt, i) => {
              const h = max > 0 ? (pt.valor / max) * altura : 0;
              return (
                <button
                  key={pt.chave}
                  type="button"
                  role="listitem"
                  aria-label={`${pt.rotuloLongo || pt.rotulo}: ${formatar(pt.valor)}`}
                  onPointerEnter={() => setAtivo(i)}
                  onFocus={() => setAtivo(i)}
                  onBlur={() => setAtivo(null)}
                  onClick={() => setAtivo(i)}
                  className="group flex h-full min-w-0 flex-1 items-end justify-center px-[1px] focus:outline-none"
                >
                  <span
                    className={`block w-full max-w-6 rounded-t-[4px] transition-opacity ${pt.valor > 0 ? "bg-marca" : ""} ${
                      ativo === null || ativo === i ? "opacity-100" : "opacity-45"
                    } group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-tinta`}
                    style={{ height: pt.valor > 0 ? Math.max(3, h) : 0 }}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex" aria-hidden="true">
            {pontos.map((pt, i) => (
              <span key={pt.chave} className="min-w-0 flex-1 text-center text-xs tabular-nums text-tinta-suave">
                {i % passo === 0 ? pt.rotulo : ""}
              </span>
            ))}
          </div>
          {p && ativo !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-linha bg-white px-3 py-2 shadow-lg"
              style={{ left: `${Math.min(80, Math.max(20, ((ativo + 0.5) / pontos.length) * 100))}%` }}
            >
              <p className="text-lg font-black text-tinta">{formatar(p.valor)}</p>
              <p className="text-sm text-tinta-suave">{p.rotuloLongo || p.rotulo}</p>
              {p.detalhes?.map((d) => (
                <p key={d.nome} className="flex justify-between gap-3 text-sm text-tinta">
                  <span className="text-tinta-suave">{d.nome}</span>
                  <span className="font-bold">{d.valor}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      {destacarMaior && pontos[maior] && pontos[maior].valor > 0 && (
        <p id={id} className="mt-2 text-sm text-tinta-suave">
          Maior: <strong className="text-tinta">{pontos[maior].rotuloLongo || pontos[maior].rotulo}</strong> · {formatar(pontos[maior].valor)}
        </p>
      )}
    </div>
  );
}

// Barras horizontais (uma série): categorias com nome, barra e valor na ponta.
export function Barras({
  itens,
  formatar,
  vazio,
}: {
  itens: { chave: string; rotulo: string; valor: number; detalhe?: string }[];
  formatar: (v: number) => string;
  vazio: string;
}) {
  if (!itens.length || itens.every((i) => i.valor <= 0)) return <p className="text-base text-tinta-suave">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.valor));
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((it) => (
        <li key={it.chave} title={`${it.rotulo}: ${formatar(it.valor)}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-base font-semibold text-tinta">{it.rotulo}</span>
            <span className="shrink-0 text-base font-bold text-tinta">
              {formatar(it.valor)}
              {it.detalhe && <span className="ml-1 text-sm font-normal text-tinta-suave">{it.detalhe}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-marca-suave" aria-hidden="true">
            <div className="h-full rounded-full bg-marca" style={{ width: `${max > 0 ? Math.max(2, (it.valor / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Número com comparação ao período anterior. Seta + texto (nunca só cor).
export function Variacao({ atual, anterior, maiorEhMelhor = true }: { atual: number; anterior: number; maiorEhMelhor?: boolean }) {
  if (!anterior && !atual) return null;
  if (!anterior) return <span className="text-sm text-tinta-suave">sem dados no período anterior</span>;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return <span className="text-sm text-tinta-suave">= igual ao período anterior</span>;
  const bom = pct > 0 === maiorEhMelhor;
  return (
    <span className={`text-sm font-bold ${bom ? "text-green-800" : "text-red-700"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-tinta-suave">vs. período anterior</span>
    </span>
  );
}

export function Tabela({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-linha">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-fundo">
          <tr>
            {colunas.map((c, i) => (
              <th key={c} scope="col" className={`px-3 py-2 font-bold text-tinta ${i > 0 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-linha">
              {l.map((v, j) => (
                <td key={j} className={`px-3 py-2 text-tinta ${j > 0 ? "text-right tabular-nums" : ""}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
