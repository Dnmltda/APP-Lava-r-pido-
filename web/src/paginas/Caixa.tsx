import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { FechamentoDoMes, GastosFixos } from "../componentes/CaixaMes";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, Confirmar, EstadoVazio, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { primeiroNome, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { LancamentoCaixa } from "../lib/tipos";

const CATEGORIAS_SAIDA = ["Produtos de limpeza", "Água e luz", "Aluguel", "Manutenção", "Salários e vales", "Outros"];
const CATEGORIAS_ENTRADA = ["Outros serviços", "Outros"];
const OFFSET = 3 * 3600000;

function mesAtual() {
  return new Date(Date.now() - OFFSET).toISOString().slice(0, 7);
}
function limitesDoMes(mes: string): [string, string] {
  const [a, m] = mes.split("-").map(Number);
  const ini = new Date(Date.UTC(a, m - 1, 1) + OFFSET).toISOString().replace("T", " ");
  const fim = new Date(Date.UTC(a, m, 1) + OFFSET).toISOString().replace("T", " ");
  return [ini, fim];
}
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export function Caixa() {
  const { empresa, vinculo } = useEmpresa();
  const [mes, setMes] = useState(mesAtual());
  const [lista, setLista] = useState<LancamentoCaixa[] | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<"entrada" | "saida" | null>(null);
  const [cancelando, setCancelando] = useState<LancamentoCaixa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);
  const patrao = pode(vinculo, "configurar_empresa");

  const carregar = useCallback(async () => {
    setErro("");
    const [de, ate] = limitesDoMes(mes);
    try {
      setLista(
        await pb.collection("lancamentos_caixa").getFullList<LancamentoCaixa>({
          filter: pb.filter("empresa = {:e} && data >= {:de} && data < {:ate}", { e: empresa.id, de, ate }),
          sort: "-data,-created",
          expand: "criado_por",
        }),
      );
      setVersao((v) => v + 1);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!pode(vinculo, "ver_valores")) return <Navigate to={`/${empresa.slug}`} replace />;

  const validos = (lista || []).filter((l) => !l.cancelado);
  const entradas = validos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const saidas = validos.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);

  async function cancelar() {
    if (!cancelando) return;
    setOcupado(true);
    try {
      await pb.collection("lancamentos_caixa").update(cancelando.id, { cancelado: true });
      setCancelando(null);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setCancelando(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}/painel`} titulo="Caixa">
      {patrao ? (
        <div className="grid grid-cols-2 gap-2">
          <Botao onClick={() => setNovo("saida")}>+ Gasto</Botao>
          <Botao variante="secundario" onClick={() => setNovo("entrada")}>
            + Entrada
          </Botao>
        </div>
      ) : (
        <Aviso tipo="info">Só o patrão lança no caixa. Você pode consultar.</Aviso>
      )}
      <div className="mt-4">
        <Campo rotulo="Mês" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      </div>
      <Link
        to={`/${empresa.slug}/fechamento`}
        className="mt-4 flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-marca bg-marca-suave px-4 py-3"
      >
        <span>
          <span className="block text-base font-extrabold text-tinta">Fechamento do dia</span>
          <span className="block text-sm text-tinta-suave">Maquininhas, Pix, dinheiro e notas do dia</span>
        </span>
        <span className="text-2xl text-marca" aria-hidden="true">›</span>
      </Link>
      <div className="mt-4 flex flex-col gap-4">
        <FechamentoDoMes mes={mes} versao={versao} />
        <GastosFixos patrao={patrao} onMudou={carregar} />
      </div>
      <h2 className="mt-6 text-lg font-extrabold text-tinta">Lançamentos do mês</h2>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-linha bg-white p-3">
          <p className="text-sm font-semibold text-tinta-suave">Gastos</p>
          <p className="text-xl font-extrabold text-tinta">{reais(saidas)}</p>
        </div>
        <div className="rounded-2xl border border-linha bg-white p-3">
          <p className="text-sm font-semibold text-tinta-suave">Outras entradas</p>
          <p className="text-xl font-extrabold text-tinta">{reais(entradas)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-tinta-suave">O faturamento de serviços e produtos entra sozinho no Painel. Aqui ficam gastos e entradas avulsas.</p>

      <div className="mt-4 flex flex-col gap-2">
        {erro && <Aviso>{erro}</Aviso>}
        {lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Nada lançado neste mês" />
        ) : (
          lista.map((l) => (
            <div key={l.id} className={`flex items-center gap-3 rounded-2xl border border-linha bg-white px-4 py-3 ${l.cancelado ? "opacity-50" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-tinta">
                  {l.categoria}
                  {l.cancelado && <span className="ml-2 text-sm font-semibold text-tinta-suave">(cancelado)</span>}
                </span>
                <span className="block truncate text-sm text-tinta-suave">
                  {FMT_DIA.format(new Date(l.data.replace(" ", "T")))} · {primeiroNome(l.expand?.criado_por?.nome || "")}
                  {l.descricao ? ` · ${l.descricao}` : ""}
                </span>
              </span>
              <span className={`shrink-0 text-lg font-extrabold tabular-nums ${l.tipo === "saida" ? "text-red-700" : "text-green-800"}`}>
                {l.tipo === "saida" ? "−" : "+"}
                {reais(l.valor)}
              </span>
              {patrao && !l.cancelado && (
                <button onClick={() => setCancelando(l)} aria-label="Cancelar lançamento" className="h-12 w-12 shrink-0 rounded-xl text-xl text-tinta-suave hover:bg-fundo">
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {novo && (
        <NovoLancamento
          tipo={novo}
          onFechar={() => setNovo(null)}
          onSalvo={() => {
            setNovo(null);
            carregar();
          }}
        />
      )}
      <Confirmar
        aberto={!!cancelando}
        titulo="Cancelar este lançamento?"
        texto="Ele deixa de contar no caixa, mas continua registrado."
        rotuloConfirmar="Cancelar lançamento"
        perigo
        carregando={ocupado}
        onConfirmar={cancelar}
        onCancelar={() => setCancelando(null)}
      />
    </Moldura>
  );
}

function NovoLancamento({ tipo, onFechar, onSalvo }: { tipo: "entrada" | "saida"; onFechar: () => void; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const categorias = tipo === "saida" ? CATEGORIAS_SAIDA : CATEGORIAS_ENTRADA;
  const [categoria, setCategoria] = useState(categorias[0]);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date(Date.now() - OFFSET).toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!v || v <= 0) return setErro("Informe o valor.");
    if (!data) return setErro("Informe a data.");
    setSalvando(true);
    try {
      await pb.collection("lancamentos_caixa").create({
        empresa: empresa.id,
        tipo,
        categoria,
        valor: Math.round(v * 100) / 100,
        data: `${data} 15:00:00.000Z`, // meio-dia em São Paulo
        descricao: descricao.trim(),
        criado_por: usuario!.id,
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={tipo === "saida" ? "Lançar gasto" : "Lançar entrada"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Categoria</legend>
          <div className="grid grid-cols-2 gap-2">
            {categorias.map((c) => (
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
          <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <Campo rotulo="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar
        </Botao>
      </form>
    </Folha>
  );
}
