import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Bloco, Indicador, NumeroPrincipal } from "../componentes/indicadores";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { primeiroNome, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { DadosArea, Holerite, Usuario, Vale } from "../lib/tipos";

const OFFSET = 3 * 3600000;
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function mesAtual() {
  return new Date(Date.now() - OFFSET).toISOString().slice(0, 7);
}
function nomeDoMes(comp: string) {
  const [a, m] = comp.split("-").map(Number);
  const t = FMT_MES.format(new Date(Date.UTC(a, m - 1, 15)));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Abre um arquivo protegido (comprovante/holerite) com token temporário.
async function abrirArquivo(record: { id: string; collectionId: string }, arquivo: string) {
  const janela = window.open("", "_blank");
  try {
    const token = await pb.files.getToken();
    const url = pb.files.getURL(record, arquivo, { token });
    if (janela) janela.location.href = url;
    else window.location.href = url;
  } catch {
    janela?.close();
    alert("Não foi possível abrir o arquivo.");
  }
}

// Minha área (própria) ou, para o patrão, a área de alguém da equipe (/equipe/:usuario).
export function MinhaArea() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario } = useSessao();
  const { usuario: alvoParam } = useParams();
  const alvo = alvoParam || usuario?.id || "";
  const deOutro = alvo !== usuario?.id;
  const patrao = pode(vinculo, "gerenciar_equipe");

  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<DadosArea | null>(null);
  const [vales, setVales] = useState<Vale[] | null>(null);
  const [holerites, setHolerites] = useState<Holerite[] | null>(null);
  const [pessoa, setPessoa] = useState<Usuario | null>(null);
  const [erro, setErro] = useState("");
  const [novoVale, setNovoVale] = useState(false);
  const [novoHolerite, setNovoHolerite] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [d, v, h, p] = await Promise.all([
        pb.send<DadosArea>(`/api/lr/minha-area/${empresa.id}`, { method: "GET", query: { mes, ...(deOutro ? { funcionario: alvo } : {}) } }),
        pb.collection("vales").getFullList<Vale>({ filter: pb.filter("empresa = {:e} && funcionario = {:u}", { e: empresa.id, u: alvo }), sort: "-data" }),
        pb.collection("holerites").getFullList<Holerite>({ filter: pb.filter("empresa = {:e} && funcionario = {:u}", { e: empresa.id, u: alvo }), sort: "-competencia" }),
        deOutro ? pb.collection("usuarios").getOne<Usuario>(alvo) : Promise.resolve(usuario as Usuario),
      ]);
      setDados(d);
      setVales(v);
      setHolerites(h);
      setPessoa(p);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, mes, alvo, deOutro, usuario]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!vinculo || vinculo.papel === "cliente") return <Navigate to={`/${empresa.slug}`} replace />;
  if (deOutro && !patrao) return <Navigate to={`/${empresa.slug}/minha-area`} replace />;

  const mesInicio = new Date(Date.parse(`${mes}-01T03:00:00Z`)).getTime();
  const mesFim = (() => {
    const [a, m] = mes.split("-").map(Number);
    return Date.UTC(a, m, 1) + OFFSET;
  })();
  const valesDoMes = (vales || []).filter((v) => {
    const t = Date.parse(v.data.replace(" ", "T"));
    return t >= mesInicio && t < mesFim;
  });

  return (
    <Moldura
      voltarPara={deOutro ? `/${empresa.slug}/equipe` : `/${empresa.slug}`}
      titulo={deOutro ? `Financeiro · ${primeiroNome(pessoa?.nome || "")}` : "Minha área"}
    >
      <Campo rotulo="Mês" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />

      {erro && !dados ? (
        <EstadoErro texto={erro} tentar={carregar} />
      ) : !dados ? (
        <Carregando />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <NumeroPrincipal
            rotulo={`Bônus estimado · ${nomeDoMes(mes).toLowerCase()}`}
            valor={reais(dados.bonus.estimado)}
            detalhe={
              <>
                {dados.bonus.valor_por_carro > 0 ? `${dados.carros.mes} carros × ${reais(dados.bonus.valor_por_carro)} = ${reais(dados.bonus.por_carros)}` : "Sem bônus por carro"}
                {" · "}comissão {reais(dados.bonus.comissao)}
                <span className="mt-1 block text-sm">Estimativa: o valor final é o do holerite.</span>
              </>
            }
          />
          <div className="grid grid-cols-3 gap-2">
            <Indicador rotulo="Lavados hoje" valor={String(dados.carros.hoje)} />
            <Indicador rotulo="Na semana" valor={String(dados.carros.semana)} />
            <Indicador rotulo="No mês" valor={String(dados.carros.mes)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Indicador rotulo="Vendas no mês" valor={reais(dados.vendas.total)} detalhe={`${dados.vendas.quantidade} venda(s)`} />
            <Indicador rotulo="Adiantado no mês" valor={reais(dados.vales.total)} detalhe={`${dados.vales.quantidade} vale(s)`} />
          </div>
          <Indicador
            rotulo="Saldo estimado (bônus − vales)"
            valor={reais(dados.saldo_estimado)}
            alerta={dados.saldo_estimado < 0}
            detalhe={dados.saldo_estimado < 0 ? "Os vales passaram do bônus estimado do mês." : undefined}
          />

          <Bloco
            titulo="Vales e adiantamentos"
            acao={
              deOutro && patrao ? (
                <button onClick={() => setNovoVale(true)} className="min-h-12 rounded-xl px-3 text-base font-bold text-marca-forte">
                  + Lançar
                </button>
              ) : undefined
            }
          >
            {vales === null ? (
              <Carregando />
            ) : valesDoMes.length === 0 ? (
              <p className="text-base text-tinta-suave">Nenhum vale neste mês.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {valesDoMes.map((v) => (
                  <li key={v.id} className={`flex items-center justify-between gap-3 rounded-xl bg-fundo px-3 py-2 ${v.cancelado ? "opacity-50" : ""}`}>
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-tinta">
                        {reais(v.valor)} · {FMT_DIA.format(new Date(v.data.replace(" ", "T")))}
                        {v.cancelado && " (cancelado)"}
                      </span>
                      {v.observacao && <span className="block truncate text-sm text-tinta-suave">{v.observacao}</span>}
                    </span>
                    {v.comprovante && (
                      <button onClick={() => abrirArquivo(v, v.comprovante)} className="min-h-12 shrink-0 rounded-xl px-3 text-base font-bold text-marca-forte">
                        Comprovante
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco
            titulo="Holerites"
            acao={
              deOutro && patrao ? (
                <button onClick={() => setNovoHolerite(true)} className="min-h-12 rounded-xl px-3 text-base font-bold text-marca-forte">
                  + Anexar
                </button>
              ) : undefined
            }
          >
            {holerites === null ? (
              <Carregando />
            ) : holerites.length === 0 ? (
              <p className="text-base text-tinta-suave">Nenhum holerite anexado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {holerites.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => abrirArquivo(h, h.arquivo)}
                      className="flex min-h-12 w-full items-center justify-between rounded-xl bg-fundo px-3 text-left text-base font-bold text-tinta"
                    >
                      {nomeDoMes(h.competencia)} <span className="text-marca-forte">Abrir ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>
        </div>
      )}

      {novoVale && (
        <NovoVale
          funcionario={alvo}
          onFechar={() => setNovoVale(false)}
          onSalvo={() => {
            setNovoVale(false);
            carregar();
          }}
        />
      )}
      {novoHolerite && (
        <NovoHolerite
          funcionario={alvo}
          competenciaPadrao={mes}
          onFechar={() => setNovoHolerite(false)}
          onSalvo={() => {
            setNovoHolerite(false);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function SeletorArquivo({ rotulo, aceita, arquivo, onEscolher }: { rotulo: string; aceita: string; arquivo: File | null; onEscolher: (f: File) => void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-linha bg-white px-4 py-2">
      <span className="min-w-0">
        <span className="block text-base font-bold text-tinta">{rotulo}</span>
        <span className="block truncate text-sm text-tinta-suave">{arquivo ? arquivo.name : "Foto ou PDF"}</span>
      </span>
      <span className="shrink-0 font-bold text-marca-forte">Escolher</span>
      <input type="file" accept={aceita} className="sr-only" onChange={(e) => e.target.files?.[0] && onEscolher(e.target.files[0])} />
    </label>
  );
}

function NovoVale({ funcionario, onFechar, onSalvo }: { funcionario: string; onFechar: () => void; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date(Date.now() - OFFSET).toISOString().slice(0, 10));
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!v || v <= 0) return setErro("Informe o valor.");
    if (arquivo && arquivo.size > 5 * 1024 * 1024) return setErro("O comprovante precisa ter no máximo 5 MB.");
    const f = new FormData();
    f.append("empresa", empresa.id);
    f.append("funcionario", funcionario);
    f.append("valor", String(Math.round(v * 100) / 100));
    f.append("data", `${data} 15:00:00.000Z`);
    f.append("observacao", obs.trim());
    f.append("lancado_por", usuario!.id);
    if (arquivo) f.append("comprovante", arquivo);
    setSalvando(true);
    try {
      await pb.collection("vales").create(f);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Lançar vale / adiantamento" onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} />
          <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <Campo rotulo="Observação (opcional)" placeholder="Pix, dinheiro…" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />
        <SeletorArquivo rotulo="Comprovante do Pix" aceita="image/*,application/pdf" arquivo={arquivo} onEscolher={setArquivo} />
        <p className="text-sm text-tinta-suave">Só você e o funcionário veem o comprovante.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Lançar vale
        </Botao>
      </form>
    </Folha>
  );
}

function NovoHolerite({
  funcionario,
  competenciaPadrao,
  onFechar,
  onSalvo,
}: {
  funcionario: string;
  competenciaPadrao: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!arquivo) return setErro("Escolha o arquivo do holerite.");
    if (arquivo.size > 10 * 1024 * 1024) return setErro("O arquivo precisa ter no máximo 10 MB.");
    const f = new FormData();
    f.append("empresa", empresa.id);
    f.append("funcionario", funcionario);
    f.append("competencia", competencia);
    f.append("lancado_por", usuario!.id);
    f.append("arquivo", arquivo);
    setSalvando(true);
    try {
      await pb.collection("holerites").create(f);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Anexar holerite" onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="Mês de referência" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        <SeletorArquivo rotulo="Holerite" aceita="image/*,application/pdf" arquivo={arquivo} onEscolher={setArquivo} />
        <p className="text-sm text-tinta-suave">Só você e o funcionário veem o holerite.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Anexar
        </Botao>
      </form>
    </Folha>
  );
}
