import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import type { GastoFixo } from "../lib/tipos";
import { Aviso, Botao, Campo, Carregando, Folha, Interruptor } from "./ui";

// Fechamento do mês (tudo de financeiro num lugar) e gastos fixos que entram sozinhos no caixa.

interface ResumoMes {
  carros: number;
  faturamento: { servicos: number; produtos: number; total: number };
  caixa: { entradas: number; saidas: number; fixos: number; variaveis: number; por_categoria: { categoria: string; valor: number }[] };
  saldo: number;
  fechamentos_dia: { cartao: number; pix: number; dinheiro: number; dias: number; anexos: number };
  vales?: number;
}

const CATEGORIAS_FIXAS = ["Aluguel", "Água e luz", "Internet e telefone", "Salários e vales", "Contador", "Outros"];

function Linha({ rotulo, valor, forte, negativo }: { rotulo: string; valor: number; forte?: boolean; negativo?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${forte ? "border-t border-linha pt-2" : ""}`}>
      <span className={`text-base ${forte ? "font-extrabold text-tinta" : "text-tinta-suave"}`}>{rotulo}</span>
      <span className={`tabular-nums ${forte ? "text-xl font-black" : "text-base font-bold"} ${negativo ? "text-red-700" : "text-tinta"}`}>
        {negativo && valor ? "−" : ""}
        {reais(Math.abs(valor))}
      </span>
    </div>
  );
}

export function FechamentoDoMes({ mes, versao }: { mes: string; versao: number }) {
  const { empresa } = useEmpresa();
  const [r, setR] = useState<ResumoMes | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setR(null);
    setErro("");
    pb.send<ResumoMes>(`/api/lr/fechamento-mes/${empresa.id}`, { method: "GET", query: { mes } })
      .then(setR)
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [empresa.id, mes, versao]);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!r) return <Carregando />;
  const f = r.fechamentos_dia;
  return (
    <section className="rounded-2xl border border-linha bg-white p-4" aria-labelledby="titulo-fechamento-mes">
      <h2 id="titulo-fechamento-mes" className="text-lg font-extrabold text-tinta">
        Fechamento do mês
      </h2>
      <p className="text-sm text-tinta-suave">
        {r.carros} {r.carros === 1 ? "carro lavado" : "carros lavados"}
      </p>
      <div className="mt-2">
        <Linha rotulo="Serviços" valor={r.faturamento.servicos} />
        <Linha rotulo="Produtos" valor={r.faturamento.produtos} />
        {r.caixa.entradas > 0 && <Linha rotulo="Outras entradas" valor={r.caixa.entradas} />}
        <Linha rotulo="Gastos fixos" valor={r.caixa.fixos} negativo />
        <Linha rotulo="Outros gastos" valor={r.caixa.variaveis} negativo />
        <Linha rotulo="Saldo do mês" valor={r.saldo} forte negativo={r.saldo < 0} />
        {r.vales !== undefined && r.vales > 0 && (
          <p className="mt-1 text-sm text-tinta-suave">Vales dados no mês: {reais(r.vales)} (só o dono vê).</p>
        )}
      </div>
      {f.dias > 0 && (
        <p className="mt-3 rounded-xl bg-fundo px-3 py-2 text-sm text-tinta">
          Conferido nos fechamentos do dia ({f.dias} {f.dias === 1 ? "dia" : "dias"}, {f.anexos} {f.anexos === 1 ? "nota" : "notas"}): cartão {reais(f.cartao)} · Pix{" "}
          {reais(f.pix)} · dinheiro {reais(f.dinheiro)}
        </p>
      )}
    </section>
  );
}

export function GastosFixos({ patrao, onMudou }: { patrao: boolean; onMudou: () => void }) {
  const { empresa } = useEmpresa();
  const [lista, setLista] = useState<GastoFixo[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<GastoFixo | "novo" | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await pb.collection("gastos_fixos").getFullList<GastoFixo>({ filter: pb.filter("empresa = {:e}", { e: empresa.id }), sort: "-ativo,dia,descricao" }));
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const total = (lista || []).filter((g) => g.ativo).reduce((s, g) => s + g.valor, 0);

  return (
    <section className="rounded-2xl border border-linha bg-white p-4" aria-labelledby="titulo-fixos">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-fixos" className="text-lg font-extrabold text-tinta">
          Gastos fixos
        </h2>
        <span className="text-base font-bold text-tinta">{reais(total)}/mês</span>
      </div>
      <p className="text-sm text-tinta-suave">Entram sozinhos no caixa todo mês, no dia do vencimento.</p>
      {erro && <Aviso>{erro}</Aviso>}
      {lista === null ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <p className="mt-2 text-base text-tinta-suave">Nenhum gasto fixo cadastrado.</p>
      ) : (
        <ul className="mt-2 divide-y divide-linha">
          {lista.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                disabled={!patrao}
                onClick={() => setEditando(g)}
                className={`flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left ${g.ativo ? "" : "opacity-50"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold text-tinta">{g.descricao}</span>
                  <span className="block text-sm text-tinta-suave">
                    {g.categoria} · todo dia {g.dia}
                    {!g.ativo && " · pausado"}
                  </span>
                </span>
                <span className="shrink-0 text-base font-extrabold tabular-nums text-tinta">{reais(g.valor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {patrao && (
        <Botao variante="secundario" largo className="mt-3" onClick={() => setEditando("novo")}>
          + Gasto fixo
        </Botao>
      )}
      {editando && (
        <EditarGastoFixo
          gasto={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
            onMudou();
          }}
        />
      )}
    </section>
  );
}

function EditarGastoFixo({ gasto, onFechar, onSalvo }: { gasto: GastoFixo | null; onFechar: () => void; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const [descricao, setDescricao] = useState(gasto?.descricao || "");
  const [categoria, setCategoria] = useState(gasto?.categoria || CATEGORIAS_FIXAS[0]);
  const [valor, setValor] = useState(gasto ? String(gasto.valor).replace(".", ",") : "");
  const [dia, setDia] = useState(gasto ? String(gasto.dia) : "5");
  const [ativo, setAtivo] = useState(gasto ? gasto.ativo : true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    const d = parseInt(dia, 10);
    if (descricao.trim().length < 2) return setErro("Diga o que é o gasto (ex.: Aluguel do galpão).");
    if (!v || v <= 0) return setErro("Informe o valor.");
    if (!d || d < 1 || d > 28) return setErro("Dia do vencimento entre 1 e 28.");
    const dados = { descricao: descricao.trim(), categoria, valor: Math.round(v * 100) / 100, dia: d, ativo };
    setSalvando(true);
    try {
      if (gasto) await pb.collection("gastos_fixos").update(gasto.id, dados);
      else await pb.collection("gastos_fixos").create({ ...dados, empresa: empresa.id, criado_por: usuario!.id });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={gasto ? "Editar gasto fixo" : "Novo gasto fixo"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="O que é" placeholder="Aluguel do galpão" value={descricao} maxLength={100} onChange={(e) => setDescricao(e.target.value)} />
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Categoria</legend>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIAS_FIXAS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={categoria === c}
                onClick={() => setCategoria(c)}
                className={`min-h-12 rounded-xl border-2 px-2 text-base font-bold ${categoria === c ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} />
          <Campo rotulo="Vence todo dia" type="number" inputMode="numeric" min={1} max={28} value={dia} onChange={(e) => setDia(e.target.value)} />
        </div>
        <Interruptor rotulo="Lançar todo mês" descricao="Desligue para pausar sem apagar o histórico." ligado={ativo} onChange={setAtivo} />
        {gasto && <p className="text-sm text-tinta-suave">Mudar o valor vale a partir do próximo mês. O que já foi lançado fica como está.</p>}
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar
        </Botao>
      </form>
    </Folha>
  );
}
