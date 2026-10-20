import { useCallback, useEffect, useState } from "react";
import { CarFront, Clock, Hourglass, Receipt, type LucideIcon } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Barras, CartaoGrafico, Colunas, compacto, Tabela, Variacao, type PontoColuna } from "../componentes/graficos";
import { Moldura } from "../componentes/Moldura";
import { Botao, Campo, Carregando, EstadoErro } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { DIAS_SEMANA, duracao, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { NOME_PAGAMENTO, type FormaPagamento } from "../lib/tipos";

// Dashboard (patrão e gerente): filtros de período numa linha só, número principal,
// indicadores com comparação, gráficos por dia e por horário, serviços, produtos,
// equipe, fila, clientes e avaliações. Exporta CSV e imprime/salva em PDF.

interface DadosRelatorio {
  periodo: { de: string; ate: string };
  resumo: { carros: number; servicos: number; produtos: number; total: number; ticket_medio: number; espera_media_min: number; lavagem_media_min: number };
  anterior: { carros: number; servicos: number; produtos: number; total: number; ticket_medio: number };
  dias: { dia: string; carros: number; servicos: number; produtos: number; total: number }[];
  horas: { hora: number; carros: number }[];
  dias_semana: number[];
  servicos: { nome: string; quantidade: number; total: number }[];
  produtos: { nome: string; quantidade: number; total: number }[];
  por_forma_pagamento: Record<FormaPagamento, number>;
  equipe: { usuario: string; nome: string; carros: number; vendas_total: number; vendas_qtd: number }[];
  fila: { total: number; app: number; balcao: number; reserva: number; cancelados: number; recusados: number; finalizados: number };
  clientes: { novos: number; atendidos: number; recorrentes: number };
  avaliacoes: { total: number; notas: { funcionario: number; atendimento: number; ambiente: number }; geral: number };
  caixa: { entradas: number; saidas: number; saldo: number };
  por_tipo?: { nome: string; carros: number; total: number }[];
  fidelizacao?: {
    planos_vendidos: number;
    planos_valor: number;
    planos_ativos: number;
    lavagens_plano: number;
    lavagens_plano_valor: number;
    premios_usados: number;
    orcamentos_pedidos: number;
    orcamentos_aceitos: number;
    orcamentos_valor_aceito: number;
    agendamentos_pedidos: number;
    agendamentos_confirmados: number;
    clientes_sumidos: number;
  };
}

type Periodo = "hoje" | "7dias" | "30dias" | "mes" | "mes_passado" | "outro";
const ROTULO: Record<Periodo, string> = { hoje: "Hoje", "7dias": "7 dias", "30dias": "30 dias", mes: "Este mês", mes_passado: "Mês passado", outro: "Escolher datas" };
const DIA = 86400000;
const OFFSET = 3 * 3600000; // São Paulo = UTC−3

const inicioDia = (ms: number) => Math.floor((ms - OFFSET) / DIA) * DIA + OFFSET;
const isoDia = (ms: number) => new Date(ms - OFFSET).toISOString().slice(0, 10);
const deIsoDia = (s: string) => Date.parse(s + "T00:00:00Z") + OFFSET;

function intervalo(p: Periodo, de: string, ate: string): [number, number] {
  const hoje = inicioDia(Date.now());
  const d = new Date(hoje - OFFSET);
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + OFFSET;
  switch (p) {
    case "7dias":
      return [hoje - 6 * DIA, hoje + DIA];
    case "30dias":
      return [hoje - 29 * DIA, hoje + DIA];
    case "mes":
      return [mes, hoje + DIA];
    case "mes_passado":
      return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) + OFFSET, mes];
    case "outro":
      return [deIsoDia(de), deIsoDia(ate) + DIA];
    default:
      return [hoje, hoje + DIA];
  }
}

const rotuloDia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function Relatorios() {
  const { empresa, vinculo } = useEmpresa();
  const [periodo, setPeriodo] = useState<Periodo>("7dias");
  const hojeIso = isoDia(Date.now());
  const [deOutro, setDeOutro] = useState(isoDia(Date.now() - 13 * DIA));
  const [ateOutro, setAteOutro] = useState(hojeIso);
  const [dados, setDados] = useState<DadosRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [de, ate] = intervalo(periodo, deOutro, ateOutro);
    if (!(ate > de)) return setErro("A data final precisa ser depois da inicial.");
    setCarregando(true);
    setErro("");
    try {
      setDados(
        await pb.send<DadosRelatorio>(`/api/lr/relatorio/${empresa.id}`, {
          method: "GET",
          query: { de: new Date(de).toISOString(), ate: new Date(ate).toISOString() },
        }),
      );
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setCarregando(false);
    }
  }, [empresa.id, periodo, deOutro, ateOutro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!pode(vinculo, "ver_valores")) return <Navigate to={`/${empresa.slug}`} replace />;

  function exportarCsv() {
    if (!dados) return;
    const n = (v: number) => String(v).replace(".", ",");
    const linhas = [
      [`Relatório ${empresa.nome}`, `${rotuloDia(isoDia(Date.parse(dados.periodo.de)))} a ${rotuloDia(isoDia(Date.parse(dados.periodo.ate) - DIA))}`],
      [],
      ["Dia", "Carros", "Serviços (R$)", "Produtos (R$)", "Total (R$)"],
      ...dados.dias.map((d) => [rotuloDia(d.dia), d.carros, n(d.servicos), n(d.produtos), n(d.total)]),
      ["Total", dados.resumo.carros, n(dados.resumo.servicos), n(dados.resumo.produtos), n(dados.resumo.total)],
      [],
      ["Serviço", "Quantidade", "Total (R$)"],
      ...dados.servicos.map((s) => [s.nome, s.quantidade, n(s.total)]),
      [],
      ["Produto", "Quantidade", "Total (R$)"],
      ...dados.produtos.map((p) => [p.nome, p.quantidade, n(p.total)]),
      [],
      ["Equipe", "Carros", "Vendas (R$)", "Nº de vendas"],
      ...dados.equipe.map((e) => [e.nome, e.carros, n(e.vendas_total), e.vendas_qtd]),
      [],
      ["Forma de pagamento (produtos)", "Total (R$)"],
      ...(Object.keys(NOME_PAGAMENTO) as FormaPagamento[]).map((f) => [NOME_PAGAMENTO[f], n(dados.por_forma_pagamento[f] || 0)]),
    ];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${empresa.slug}-${isoDia(Date.parse(dados.periodo.de))}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const umDia = dados ? dados.dias.length <= 1 : periodo === "hoje";

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Dashboard" largo>
      {/* Filtro de período: uma linha, acima de tudo que ele afeta */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 print:hidden" role="tablist" aria-label="Período">
        {(Object.keys(ROTULO) as Periodo[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={periodo === p}
            onClick={() => setPeriodo(p)}
            className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-base font-bold ${periodo === p ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
          >
            {ROTULO[p]}
          </button>
        ))}
      </div>
      {periodo === "outro" && (
        <div className="mt-3 grid grid-cols-2 gap-3 print:hidden">
          <Campo rotulo="De" type="date" value={deOutro} max={ateOutro} onChange={(e) => setDeOutro(e.target.value)} />
          <Campo rotulo="Até" type="date" value={ateOutro} min={deOutro} max={hojeIso} onChange={(e) => setAteOutro(e.target.value)} />
        </div>
      )}

      {erro && !dados ? (
        <EstadoErro texto={erro} tentar={carregar} />
      ) : !dados ? (
        <Carregando texto="Montando o relatório…" />
      ) : (
        <div className={`mt-4 flex flex-col gap-4 transition-opacity ${carregando ? "opacity-50" : ""}`} aria-busy={carregando}>
          <p className="text-sm text-tinta-suave">
            {empresa.nome} · {rotuloDia(isoDia(Date.parse(dados.periodo.de)))}
            {dados.dias.length > 1 ? ` a ${rotuloDia(isoDia(Date.parse(dados.periodo.ate) - DIA))}` : ""}
          </p>

          {/* Número principal */}
          <section className="relative overflow-hidden rounded-3xl bg-marca p-5 text-sobre-marca shadow-lg sm:p-7 print:border print:border-linha print:bg-white print:text-tinta">
            <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 print:hidden" />
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-black/10 print:hidden" />
            <p className="text-base font-semibold opacity-90">Faturamento</p>
            <p className="relative mt-1 text-5xl font-black leading-none tracking-tight sm:text-6xl">{reais(dados.resumo.total)}</p>
            <p className="mt-3 text-base opacity-95">
              Serviços {reais(dados.resumo.servicos)} · Produtos {reais(dados.resumo.produtos)}
            </p>
            {(dados.resumo.total > 0 || dados.anterior.total > 0) && (
              <div className="mt-2 inline-block rounded-lg bg-white/95 px-2 py-1">
                <Variacao atual={dados.resumo.total} anterior={dados.anterior.total} />
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Bloco icone={CarFront} rotulo="Carros lavados" valor={String(dados.resumo.carros)} rodape={<Variacao atual={dados.resumo.carros} anterior={dados.anterior.carros} />} />
            <Bloco icone={Receipt} rotulo="Ticket médio" valor={reais(dados.resumo.ticket_medio)} rodape={<Variacao atual={dados.resumo.ticket_medio} anterior={dados.anterior.ticket_medio} />} />
            <Bloco icone={Hourglass} rotulo="Espera média" valor={dados.resumo.espera_media_min ? duracao(dados.resumo.espera_media_min) : "—"} rodape={<span className="text-sm text-tinta-suave">do pedido até começar</span>} />
            <Bloco icone={Clock} rotulo="Tempo de lavagem" valor={dados.resumo.lavagem_media_min ? duracao(dados.resumo.lavagem_media_min) : "—"} rodape={<span className="text-sm text-tinta-suave">média por carro</span>} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
          {!umDia && (
            <CartaoGrafico
              titulo="Faturamento por dia"
              subtitulo="Serviços + produtos"
              tabela={<Tabela colunas={["Dia", "Serviços", "Produtos", "Total"]} linhas={dados.dias.map((d) => [rotuloDia(d.dia), reais(d.servicos), reais(d.produtos), reais(d.total)])} />}
            >
              <Colunas
                destacarMaior
                formatar={reais}
                formatarEixo={(v) => `R$ ${compacto(v)}`}
                pontos={dados.dias.map<PontoColuna>((d) => ({
                  chave: d.dia,
                  rotulo: rotuloDia(d.dia),
                  rotuloLongo: `${DIAS_SEMANA[new Date(d.dia + "T12:00:00Z").getUTCDay()]}, ${rotuloDia(d.dia)}`,
                  valor: d.total,
                  detalhes: [
                    { nome: "Serviços", valor: reais(d.servicos) },
                    { nome: "Produtos", valor: reais(d.produtos) },
                    { nome: "Carros", valor: String(d.carros) },
                  ],
                }))}
              />
            </CartaoGrafico>
          )}

          {!umDia && (
            <CartaoGrafico
              titulo="Carros lavados por dia"
              tabela={<Tabela colunas={["Dia", "Carros"]} linhas={dados.dias.map((d) => [rotuloDia(d.dia), d.carros])} />}
            >
              <Colunas
                destacarMaior
                formatar={(v) => `${v} ${v === 1 ? "carro" : "carros"}`}
                pontos={dados.dias.map((d) => ({
                  chave: d.dia,
                  rotulo: rotuloDia(d.dia),
                  rotuloLongo: `${DIAS_SEMANA[new Date(d.dia + "T12:00:00Z").getUTCDay()]}, ${rotuloDia(d.dia)}`,
                  valor: d.carros,
                }))}
              />
            </CartaoGrafico>
          )}

          <CartaoGrafico
            titulo="Horário de movimento"
            subtitulo="Carros pela hora em que começaram a ser lavados"
            tabela={<Tabela colunas={["Hora", "Carros"]} linhas={faixaHoras(dados.horas).map((h) => [`${h.hora}h`, h.carros])} />}
          >
            <Colunas
              destacarMaior
              formatar={(v) => `${v} ${v === 1 ? "carro" : "carros"}`}
              pontos={faixaHoras(dados.horas).map((h) => ({ chave: String(h.hora), rotulo: `${h.hora}h`, rotuloLongo: `${h.hora}h às ${h.hora + 1}h`, valor: h.carros }))}
            />
          </CartaoGrafico>

          {dados.dias.length >= 7 && (
            <CartaoGrafico
              titulo="Movimento por dia da semana"
              tabela={<Tabela colunas={["Dia", "Carros"]} linhas={DIAS_SEMANA.map((d, i) => [d, dados.dias_semana[i]])} />}
            >
              <Colunas
                destacarMaior
                formatar={(v) => `${v} ${v === 1 ? "carro" : "carros"}`}
                pontos={SEMANA_CURTA.map((d, i) => ({ chave: d, rotulo: d, rotuloLongo: DIAS_SEMANA[i], valor: dados.dias_semana[i] }))}
              />
            </CartaoGrafico>
          )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico titulo="Serviços mais pedidos">
              <Barras
                vazio="Nenhum carro lavado no período."
                formatar={(v) => `${v}×`}
                itens={dados.servicos.map((s) => ({ chave: s.nome, rotulo: s.nome, valor: s.quantidade, detalhe: reais(s.total) }))}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Produtos mais vendidos">
              <Barras
                vazio="Nenhuma venda de produto no período."
                formatar={reais}
                itens={dados.produtos.slice(0, 8).map((p) => ({ chave: p.nome, rotulo: p.nome, valor: p.total, detalhe: `${p.quantidade} un.` }))}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Formas de pagamento" subtitulo="Vendas de produtos">
              <Barras
                vazio="Nenhuma venda de produto no período."
                formatar={reais}
                itens={(Object.keys(NOME_PAGAMENTO) as FormaPagamento[]).map((f) => ({ chave: f, rotulo: NOME_PAGAMENTO[f], valor: dados.por_forma_pagamento[f] || 0 }))}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Equipe"
              subtitulo="Carros lavados e vendas no período"
              tabela={<Tabela colunas={["Pessoa", "Carros", "Vendas", "Nº"]} linhas={dados.equipe.map((e) => [e.nome, e.carros, reais(e.vendas_total), e.vendas_qtd])} />}
            >
              <Barras
                vazio="Ninguém lavou carro no período."
                formatar={(v) => `${v} ${v === 1 ? "carro" : "carros"}`}
                itens={dados.equipe.map((e) => ({ chave: e.usuario, rotulo: e.nome, valor: e.carros, detalhe: e.vendas_total ? `· ${reais(e.vendas_total)}` : undefined }))}
              />
            </CartaoGrafico>
          </div>

          {dados.por_tipo && dados.por_tipo.length > 0 && (
            <CartaoGrafico
              titulo="Por tamanho / tipo de carro"
              subtitulo="Carros lavados e faturamento de serviço"
              tabela={<Tabela colunas={["Tipo", "Carros", "Serviços"]} linhas={dados.por_tipo.map((t) => [t.nome, t.carros, reais(t.total)])} />}
            >
              <Barras
                vazio="Nenhum carro lavado no período."
                formatar={(v) => `${v} ${v === 1 ? "carro" : "carros"}`}
                itens={dados.por_tipo.map((t) => ({ chave: t.nome, rotulo: t.nome, valor: t.carros, detalhe: reais(t.total) }))}
              />
            </CartaoGrafico>
          )}

          {dados.fidelizacao && (
            <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid">
              <h2 className="mb-3 text-lg font-extrabold text-tinta">Fidelização</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Mini rotulo="Planos vendidos" valor={dados.fidelizacao.planos_vendidos} detalhe={`${reais(dados.fidelizacao.planos_valor)} · ${dados.fidelizacao.planos_ativos} ativos hoje`} />
                <Mini rotulo="Lavagens por plano" valor={dados.fidelizacao.lavagens_plano} detalhe={`${reais(dados.fidelizacao.lavagens_plano_valor)} em tabela`} />
                <Mini rotulo="Prêmios fidelidade" valor={dados.fidelizacao.premios_usados} detalhe="usados no período" />
                <Mini rotulo="Orçamentos" valor={dados.fidelizacao.orcamentos_pedidos} detalhe={`${dados.fidelizacao.orcamentos_aceitos} aceitos · ${reais(dados.fidelizacao.orcamentos_valor_aceito)}`} />
                <Mini rotulo="Pedidos de horário" valor={dados.fidelizacao.agendamentos_pedidos} detalhe={`${dados.fidelizacao.agendamentos_confirmados} confirmados`} />
                <Mini rotulo="Clientes sumidos" valor={dados.fidelizacao.clientes_sumidos} detalhe="sem voltar há 30+ dias" />
              </div>
              {dados.fidelizacao.clientes_sumidos > 0 && (
                <Link to={`/${empresa.slug}/reativar`} className="mt-3 inline-flex min-h-11 items-center rounded-xl px-1 text-base font-bold text-marca-forte underline print:hidden">
                  Mandar mensagem para quem sumiu →
                </Link>
              )}
            </section>
          )}

          <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid">
            <h2 className="mb-3 text-lg font-extrabold text-tinta">Fila e clientes</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Mini rotulo="Entraram na fila" valor={dados.fila.total} detalhe={`app ${dados.fila.app} · balcão ${dados.fila.balcao} · reserva ${dados.fila.reserva}`} />
              <Mini rotulo="Atendidos" valor={dados.fila.finalizados} detalhe={`${pct(dados.fila.finalizados, dados.fila.total)} de quem entrou`} />
              <Mini rotulo="Cancelados / recusados" valor={dados.fila.cancelados + dados.fila.recusados} detalhe={`${pct(dados.fila.cancelados + dados.fila.recusados, dados.fila.total)} de quem entrou`} />
              <Mini rotulo="Clientes novos" valor={dados.clientes.novos} detalhe="cadastros no app" />
              <Mini rotulo="Clientes atendidos" valor={dados.clientes.atendidos} detalhe="pelo app" />
              <Mini rotulo="Voltaram 2+ vezes" valor={dados.clientes.recorrentes} detalhe="no período" />
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid">
              <h2 className="text-lg font-extrabold text-tinta">Avaliações</h2>
              {dados.avaliacoes.total ? (
                <>
                  <p className="mt-1 text-4xl font-black text-tinta">
                    {dados.avaliacoes.geral.toLocaleString("pt-BR")} <span className="text-2xl text-amber-500" aria-hidden="true">★</span>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {dados.avaliacoes.total} {dados.avaliacoes.total === 1 ? "avaliação" : "avaliações"} · lavagem {dados.avaliacoes.notas.funcionario} · atendimento{" "}
                    {dados.avaliacoes.notas.atendimento} · ambiente {dados.avaliacoes.notas.ambiente}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-base text-tinta-suave">Nenhuma avaliação no período.</p>
              )}
            </section>
            <section className="rounded-3xl border border-linha bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid">
              <h2 className="text-lg font-extrabold text-tinta">Caixa</h2>
              <p className="mt-1 text-4xl font-black text-tinta">{reais(dados.caixa.saldo)}</p>
              <p className="text-sm text-tinta-suave">
                saldo = faturamento + entradas {reais(dados.caixa.entradas)} − gastos {reais(dados.caixa.saidas)}
              </p>
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3 print:hidden">
            <Botao variante="secundario" onClick={exportarCsv}>
              Baixar planilha (CSV)
            </Botao>
            <Botao variante="secundario" onClick={() => window.print()}>
              Imprimir / PDF
            </Botao>
          </div>
        </div>
      )}
    </Moldura>
  );
}

// Mostra só a faixa de horas com movimento (com 1 h de folga), mínimo 8h às 18h.
function faixaHoras(horas: { hora: number; carros: number }[]) {
  const com = horas.filter((h) => h.carros > 0).map((h) => h.hora);
  const ini = Math.max(0, Math.min(8, ...(com.length ? [Math.min(...com) - 1] : [8])));
  const fim = Math.min(23, Math.max(18, ...(com.length ? [Math.max(...com) + 1] : [18])));
  return horas.filter((h) => h.hora >= ini && h.hora <= fim);
}

function Bloco({ rotulo, valor, rodape, icone: Icone }: { rotulo: string; valor: string; rodape?: React.ReactNode; icone?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-linha bg-white p-4 shadow-sm print:break-inside-avoid">
      <p className="flex items-center gap-2 text-sm font-semibold text-tinta-suave">
        {Icone && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca-suave text-marca-forte">
            <Icone className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-extrabold leading-tight text-tinta">{valor}</p>
      {rodape && <div className="mt-1">{rodape}</div>}
    </div>
  );
}

function Mini({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe: string }) {
  return (
    <div className="rounded-2xl bg-fundo p-3">
      <p className="text-sm font-semibold text-tinta-suave">{rotulo}</p>
      <p className="text-2xl font-extrabold text-tinta">{valor}</p>
      <p className="text-xs text-tinta-suave">{detalhe}</p>
    </div>
  );
}
