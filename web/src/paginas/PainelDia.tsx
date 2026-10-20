import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { BarraMeta, Bloco, Indicador, ListaComBarras, NumeroPrincipal } from "../componentes/indicadores";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { hora } from "../lib/fila";
import { reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { NOME_PAGAMENTO, type DadosPainel, type FormaPagamento, type Meta } from "../lib/tipos";

type Periodo = "hoje" | "ontem" | "7dias" | "mes";

const DIA = 86400000;
const OFFSET = 3 * 3600000; // São Paulo = UTC−3

function intervalo(p: Periodo): [number, number] {
  const agora = Date.now();
  const hoje = Math.floor((agora - OFFSET) / DIA) * DIA + OFFSET;
  if (p === "ontem") return [hoje - DIA, hoje];
  if (p === "7dias") return [hoje - 6 * DIA, hoje + DIA];
  if (p === "mes") {
    const d = new Date(agora - OFFSET);
    return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + OFFSET, hoje + DIA];
  }
  return [hoje, hoje + DIA];
}

const ROTULO: Record<Periodo, string> = { hoje: "Hoje", ontem: "Ontem", "7dias": "7 dias", mes: "Este mês" };

export function PainelDia() {
  const { empresa, vinculo } = useEmpresa();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [erro, setErro] = useState("");
  const [editandoMetas, setEditandoMetas] = useState(false);
  const patrao = pode(vinculo, "configurar_empresa");

  const carregar = useCallback(async () => {
    setErro("");
    const [de, ate] = intervalo(periodo);
    try {
      setDados(
        await pb.send<DadosPainel>(`/api/lr/painel/${empresa.id}`, {
          method: "GET",
          query: { de: new Date(de).toISOString(), ate: new Date(ate).toISOString() },
        }),
      );
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, periodo]);

  useEffect(() => {
    carregar();
    const t = window.setInterval(carregar, 60_000);
    return () => window.clearInterval(t);
  }, [carregar]);

  if (!pode(vinculo, "ver_valores")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Painel">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Período">
        {(Object.keys(ROTULO) as Periodo[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={periodo === p}
            onClick={() => {
              setDados(null);
              setPeriodo(p);
            }}
            className={`min-h-12 shrink-0 rounded-full border-2 px-4 text-base font-bold ${periodo === p ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
          >
            {ROTULO[p]}
          </button>
        ))}
      </div>

      {erro && !dados ? (
        <EstadoErro texto={erro} tentar={carregar} />
      ) : !dados ? (
        <Carregando />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <NumeroPrincipal
            rotulo={`Faturamento · ${ROTULO[periodo].toLowerCase()}`}
            valor={reais(dados.faturamento.total)}
            detalhe={
              <>
                Serviços {reais(dados.faturamento.servicos)} · Produtos {reais(dados.faturamento.produtos)}
              </>
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <Indicador rotulo="Carros lavados" valor={String(dados.carros_lavados)} />
            <Indicador rotulo="Saldo" valor={reais(dados.saldo)} detalhe="faturamento + entradas − gastos" alerta={dados.saldo < 0} />
            <Indicador rotulo="Gastos" valor={reais(dados.caixa.saidas)} />
            <Indicador rotulo="Outras entradas" valor={reais(dados.caixa.entradas)} />
          </div>

          <Bloco
            titulo="Metas"
            acao={
              patrao && (
                <button onClick={() => setEditandoMetas(true)} className="min-h-12 rounded-xl px-3 text-base font-bold text-marca-forte">
                  Definir
                </button>
              )
            }
          >
            <div className="flex flex-col gap-4">
              <BarraMeta rotulo="Hoje" realizado={dados.metas.realizado_dia} meta={dados.metas.dia} formatar={reais} />
              <BarraMeta rotulo="Este mês" realizado={dados.metas.realizado_mes} meta={dados.metas.mes} formatar={reais} />
            </div>
          </Bloco>

          <Bloco
            titulo="Fila agora"
            acao={
              <Link to={`/${empresa.slug}/fila`} className="min-h-12 rounded-xl px-3 py-3 text-base font-bold text-marca-forte">
                Abrir ›
              </Link>
            }
          >
            <div className="grid grid-cols-3 gap-2 text-center">
              <Contador rotulo="Esperando" valor={dados.fila_agora.esperando} />
              <Contador rotulo="Lavando" valor={dados.fila_agora.lavando} />
              <Contador rotulo="Prontos" valor={dados.fila_agora.prontos} />
            </div>
            {(dados.fila_agora.pendentes > 0 || dados.fila_agora.clientes_atrasados > 0) && (
              <p className="mt-3 text-base text-tinta">
                {dados.fila_agora.pendentes > 0 && <span className="mr-3">⏳ {dados.fila_agora.pendentes} aguardando confirmação</span>}
                {dados.fila_agora.clientes_atrasados > 0 && <span>⚠️ {dados.fila_agora.clientes_atrasados} cliente(s) atrasado(s)</span>}
              </p>
            )}
          </Bloco>

          {dados.estoque_baixo.length > 0 && (
            <div role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
              <p className="text-lg font-extrabold text-red-800">⚠️ Estoque baixo</p>
              <ul className="mt-1 text-base text-red-900">
                {dados.estoque_baixo.map((p) => (
                  <li key={p.id}>
                    {p.nome}: <strong>{p.estoque}</strong> (mínimo {p.minimo})
                  </li>
                ))}
              </ul>
              {patrao && (
                <Link to={`/${empresa.slug}/produtos`} className="mt-2 inline-flex min-h-12 items-center font-bold text-red-800 underline">
                  Ajustar estoque
                </Link>
              )}
            </div>
          )}

          <Bloco titulo="Vendas por funcionário">
            <ListaComBarras
              vazio="Nenhuma venda nem carro lavado no período."
              itens={dados.ranking_funcionarios.map((r) => ({
                chave: r.usuario,
                rotulo: r.nome,
                valor: r.vendas_total,
                texto: reais(r.vendas_total),
                detalhe: `${r.carros} carro${r.carros === 1 ? "" : "s"}`,
              }))}
            />
          </Bloco>

          <Bloco titulo="Produtos mais vendidos">
            <ListaComBarras
              vazio="Nenhum produto vendido no período."
              itens={dados.ranking_produtos.map((p) => ({
                chave: p.nome,
                rotulo: p.nome,
                valor: p.total,
                texto: reais(p.total),
                detalhe: `${p.quantidade} un.`,
              }))}
            />
          </Bloco>

          <Bloco titulo="Formas de pagamento (produtos)">
            <table className="w-full text-base">
              <tbody>
                {(Object.keys(NOME_PAGAMENTO) as FormaPagamento[]).map((f) => (
                  <tr key={f} className="border-b border-linha last:border-0">
                    <td className="py-2 text-tinta">{NOME_PAGAMENTO[f]}</td>
                    <td className="py-2 text-right font-bold text-tinta tabular-nums">{reais(dados.por_forma_pagamento[f] || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloco>

          <Bloco
            titulo="Gastos"
            acao={
              <Link to={`/${empresa.slug}/caixa`} className="min-h-12 rounded-xl px-3 py-3 text-base font-bold text-marca-forte">
                Caixa ›
              </Link>
            }
          >
            <ListaComBarras
              vazio="Nenhum gasto lançado no período."
              itens={Object.entries(dados.caixa.gastos_por_categoria)
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => ({ chave: c, rotulo: c, valor: v, texto: reais(v) }))}
            />
          </Bloco>

          <Bloco titulo="Atrasos da fila">
            {dados.atrasos.total === 0 ? (
              <p className="text-base text-tinta-suave">Nenhum carro começou atrasado em relação à previsão. 👍</p>
            ) : (
              <>
                <p className="text-base text-tinta">
                  <strong>{dados.atrasos.total}</strong> carro(s) começaram depois da previsão · média de <strong>{dados.atrasos.media_min} min</strong>.
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-base text-tinta-suave">
                  {dados.atrasos.lista.slice(0, 8).map((a) => (
                    <li key={a.id}>
                      Previsto {hora(a.previsto)}, começou {hora(a.inicio)} · <strong className="text-tinta">+{a.minutos} min</strong>
                      {a.reserva && " · reserva"}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Bloco>
        </div>
      )}

      {editandoMetas && (
        <EditarMetas
          onFechar={() => setEditandoMetas(false)}
          onSalvo={() => {
            setEditandoMetas(false);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function Contador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-xl bg-fundo py-3">
      <p className="text-3xl font-black text-tinta">{valor}</p>
      <p className="text-sm font-semibold text-tinta-suave">{rotulo}</p>
    </div>
  );
}

function EditarMetas({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const [metas, setMetas] = useState<Meta[] | null>(null);
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    pb.collection("metas")
      .getFullList<Meta>({ filter: pb.filter("empresa = {:e}", { e: empresa.id }) })
      .then((m) => {
        setMetas(m);
        setDia(String(m.find((x) => x.periodo === "dia")?.valor || "").replace(".", ","));
        setMes(String(m.find((x) => x.periodo === "mes")?.valor || "").replace(".", ","));
      })
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [empresa.id]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const n = (v: string) => Number(v.replace(/\./g, "").replace(",", ".") || "0");
    if (isNaN(n(dia)) || isNaN(n(mes)) || n(dia) < 0 || n(mes) < 0) return setErro("Valor inválido.");
    setSalvando(true);
    try {
      for (const [periodo, valor] of [["dia", n(dia)], ["mes", n(mes)]] as const) {
        const existente = metas?.find((m) => m.periodo === periodo);
        if (existente) await pb.collection("metas").update(existente.id, { valor });
        else await pb.collection("metas").create({ empresa: empresa.id, periodo, valor });
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Metas de faturamento" onFechar={onFechar}>
      {metas === null && !erro ? (
        <Carregando />
      ) : (
        <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
          <p className="text-base text-tinta-suave">Faturamento = serviços + produtos. Deixe 0 para não usar a meta.</p>
          <Campo rotulo="Meta do dia (R$)" inputMode="decimal" value={dia} onChange={(e) => setDia(e.target.value.replace(/[^\d,.]/g, ""))} />
          <Campo rotulo="Meta do mês (R$)" inputMode="decimal" value={mes} onChange={(e) => setMes(e.target.value.replace(/[^\d,.]/g, ""))} />
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" largo carregando={salvando}>
            Salvar metas
          </Botao>
        </form>
      )}
    </Folha>
  );
}
