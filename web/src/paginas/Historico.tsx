import { History, Package, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Carregando, EstadoErro, EstadoVazio } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { mensagemDeErro, pb } from "../lib/pb";

// Histórico do cliente: quantas vezes veio, desde quando, serviços e produtos.
// Sem valores, de propósito (decisão do Diego).

export interface DadosHistorico {
  cliente_desde: string;
  total_visitas: number;
  ultima_visita: string;
  por_servico: { nome: string; vezes: number }[];
  produtos: { nome: string; quantidade: number }[];
  visitas: { id: string; data: string; servico: string; produtos: { nome: string; quantidade: number }[] }[];
}

const FMT_DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const FMT_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const dataDe = (s: string) => new Date(s.replace(" ", "T"));
export const vezes = (n: number) => `${n} ${n === 1 ? "vez" : "vezes"}`;

export function tempoDeCliente(desde: string) {
  const dias = Math.max(0, Math.floor((Date.now() - dataDe(desde).getTime()) / 86400000));
  if (dias < 1) return "desde hoje";
  if (dias < 31) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  const meses = Math.floor(dias / 30.44);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}${resto ? ` e ${resto} ${resto === 1 ? "mês" : "meses"}` : ""}`;
}

export function useHistorico(slug: string, ativo = true) {
  const [dados, setDados] = useState<DadosHistorico | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!ativo) return;
    pb.send<DadosHistorico>(`/api/lr/meu-historico/${encodeURIComponent(slug)}`, { method: "GET" })
      .then((d) => {
        setDados(d);
        setErro("");
      })
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [slug, ativo]);
  return { dados, erro };
}

export function Historico() {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const { dados, erro } = useHistorico(empresa.slug, !!usuario);
  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Meu histórico">
      {erro ? (
        <EstadoErro texto={erro} />
      ) : !dados ? (
        <Carregando />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl bg-marca p-5 text-sobre-marca shadow-lg">
            <p className="text-base font-semibold opacity-90">Você já veio ao {empresa.nome}</p>
            <p className="mt-1 text-5xl font-black leading-none">{vezes(dados.total_visitas)}</p>
            <p className="mt-3 text-base opacity-95">
              Cliente {tempoDeCliente(dados.cliente_desde)}
              {tempoDeCliente(dados.cliente_desde) !== "desde hoje" ? ` (desde ${FMT_MES.format(dataDe(dados.cliente_desde))})` : ""}
              {dados.ultima_visita ? ` · última visita em ${FMT_DATA.format(dataDe(dados.ultima_visita))}` : ""}
            </p>
          </section>

          {dados.total_visitas === 0 ? (
            <EstadoVazio titulo="Nenhuma lavagem ainda" texto="Depois da sua primeira lavagem pelo app, ela aparece aqui." />
          ) : (
            <>
              <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-tinta">
                  <Sparkles className="h-5 w-5 text-marca-forte" aria-hidden="true" /> Serviços que você fez
                </h2>
                <ul className="mt-2 divide-y divide-linha">
                  {dados.por_servico.map((s) => (
                    <li key={s.nome} className="flex items-center justify-between gap-3 py-2 text-base">
                      <span className="text-tinta">{s.nome}</span>
                      <strong className="shrink-0 text-tinta">{vezes(s.vezes)}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              {dados.produtos.length > 0 && (
                <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm">
                  <h2 className="flex items-center gap-2 text-lg font-extrabold text-tinta">
                    <Package className="h-5 w-5 text-marca-forte" aria-hidden="true" /> Produtos que você comprou
                  </h2>
                  <ul className="mt-2 divide-y divide-linha">
                    {dados.produtos.map((p) => (
                      <li key={p.nome} className="flex items-center justify-between gap-3 py-2 text-base">
                        <span className="text-tinta">{p.nome}</span>
                        <strong className="shrink-0 text-tinta">{p.quantidade} un.</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-tinta">
                  <History className="h-5 w-5 text-marca-forte" aria-hidden="true" /> Suas visitas
                </h2>
                <ol className="mt-2 divide-y divide-linha">
                  {dados.visitas.map((v) => (
                    <li key={v.id} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-base font-bold text-tinta">{v.servico}</span>
                        <span className="shrink-0 text-sm tabular-nums text-tinta-suave">{FMT_DATA.format(dataDe(v.data))}</span>
                      </div>
                      {v.produtos.length > 0 && (
                        <p className="mt-0.5 text-sm text-tinta-suave">+ {v.produtos.map((p) => `${p.quantidade}× ${p.nome}`).join(", ")}</p>
                      )}
                    </li>
                  ))}
                </ol>
                {dados.total_visitas > dados.visitas.length && (
                  <p className="mt-2 text-sm text-tinta-suave">Mostrando as {dados.visitas.length} visitas mais recentes.</p>
                )}
              </section>
            </>
          )}
          <Link to={`/${empresa.slug}`} className="text-center text-base font-bold text-marca-forte underline">
            Voltar para a fila
          </Link>
        </div>
      )}
    </Moldura>
  );
}
