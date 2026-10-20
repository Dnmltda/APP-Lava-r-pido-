import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { EscolherEstrelas, MostrarEstrelas } from "../componentes/Estrelas";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Carregando, EstadoErro, EstadoVazio } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { mensagemDeErro, pb } from "../lib/pb";

// ---------------------------------------------------------- cliente avalia
interface InfoAvaliacao {
  entrada: string;
  status: string;
  servico: string;
  funcionario: string;
  ja_avaliada: boolean;
}

export function Avaliar() {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const { entrada = "" } = useParams();
  const [info, setInfo] = useState<InfoAvaliacao | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [notas, setNotas] = useState({ nota_funcionario: 0, nota_atendimento: 0, nota_ambiente: 0 });
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    pb.send<InfoAvaliacao>(`/api/lr/avaliacao/${entrada}`, { method: "GET" })
      .then(setInfo)
      .catch((err) => setErroCarga(mensagemDeErro(err)));
  }, [entrada, usuario]);

  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!notas.nota_funcionario || !notas.nota_atendimento || !notas.nota_ambiente) return setErro("Dê de 1 a 5 estrelas para cada item.");
    setEnviando(true);
    try {
      await pb.send("/api/lr/avaliar", { method: "POST", body: { entrada, ...notas, comentario: comentario.trim() } });
      setEnviado(true);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Avaliar a lavagem">
      {erroCarga ? (
        <EstadoErro texto={erroCarga} />
      ) : !info ? (
        <Carregando />
      ) : enviado || info.ja_avaliada ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-5xl" aria-hidden="true">
            🙏
          </p>
          <p className="text-2xl font-extrabold text-tinta">Obrigado pela avaliação!</p>
          <p className="text-base text-tinta-suave">Ela ajuda o {empresa.nome} a melhorar sempre.</p>
          <Link to={`/${empresa.slug}`} className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-marca px-6 font-bold text-sobre-marca">
            Voltar ao início
          </Link>
        </div>
      ) : info.status !== "finalizado" ? (
        <EstadoVazio titulo="Ainda não dá para avaliar" texto="A avaliação abre quando o carro for entregue." />
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
          <p className="text-base text-tinta">
            <strong>{info.servico}</strong>
            {info.funcionario && ` · lavado por ${info.funcionario}`}
          </p>
          <EscolherEstrelas
            rotulo={info.funcionario ? `${info.funcionario} (quem lavou)` : "Quem lavou"}
            valor={notas.nota_funcionario}
            onChange={(n) => setNotas((x) => ({ ...x, nota_funcionario: n }))}
          />
          <EscolherEstrelas rotulo="Atendimento" valor={notas.nota_atendimento} onChange={(n) => setNotas((x) => ({ ...x, nota_atendimento: n }))} />
          <EscolherEstrelas rotulo="Ambiente" valor={notas.nota_ambiente} onChange={(n) => setNotas((x) => ({ ...x, nota_ambiente: n }))} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="coment" className="text-base font-bold text-tinta">
              Quer contar algo? (opcional)
            </label>
            <textarea
              id="coment"
              rows={3}
              maxLength={500}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base focus:border-marca focus:outline-none"
            />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" largo carregando={enviando}>
            Enviar avaliação
          </Botao>
        </form>
      )}
    </Moldura>
  );
}

// ---------------------------------------------------------- equipe vê
interface ListaAvaliacoes {
  total: number;
  media: { funcionario: number; atendimento: number; ambiente: number; geral: number };
  lista: {
    id: string;
    criado_em: string;
    nota_funcionario: number;
    nota_atendimento: number;
    nota_ambiente: number;
    comentario: string;
    funcionario: string;
    cliente?: string;
  }[];
}

const FMT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function Avaliacoes() {
  const { empresa, vinculo } = useEmpresa();
  const [minhas, setMinhas] = useState(false);
  const [dados, setDados] = useState<ListaAvaliacoes | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      setDados(await pb.send<ListaAvaliacoes>(`/api/lr/avaliacoes/${empresa.id}`, { method: "GET", query: minhas ? { funcionario: "eu" } : {} }));
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, minhas]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!vinculo || vinculo.papel === "cliente") return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Avaliações">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {[false, true].map((m) => (
          <button
            key={String(m)}
            role="tab"
            aria-selected={minhas === m}
            onClick={() => {
              setDados(null);
              setMinhas(m);
            }}
            className={`min-h-12 rounded-xl border-2 text-base font-bold ${minhas === m ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
          >
            {m ? "Minhas" : "Todas"}
          </button>
        ))}
      </div>
      {vinculo.papel !== "patrao" && <p className="mt-3 text-sm text-tinta-suave">O nome do cliente não aparece para a equipe.</p>}

      {erro ? (
        <EstadoErro texto={erro} tentar={carregar} />
      ) : !dados ? (
        <Carregando />
      ) : dados.total === 0 ? (
        <div className="mt-4">
          <EstadoVazio titulo="Nenhuma avaliação ainda" texto="Depois da baixa, o cliente recebe o convite para avaliar." />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-linha bg-white p-4 shadow-sm">
            <p className="text-base font-semibold text-tinta-suave">Nota geral · {dados.total} avaliação(ões)</p>
            <p className="text-5xl font-black text-tinta">{dados.media.geral.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</p>
            <div className="mt-3 flex flex-col gap-1 text-base text-tinta">
              <span className="flex justify-between">
                Quem lavou <MostrarEstrelas nota={dados.media.funcionario} rotulo="Quem lavou" />
              </span>
              <span className="flex justify-between">
                Atendimento <MostrarEstrelas nota={dados.media.atendimento} rotulo="Atendimento" />
              </span>
              <span className="flex justify-between">
                Ambiente <MostrarEstrelas nota={dados.media.ambiente} rotulo="Ambiente" />
              </span>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {dados.lista.map((a) => (
              <li key={a.id} className="rounded-2xl border border-linha bg-white p-4">
                <p className="text-sm text-tinta-suave">
                  {FMT.format(new Date(a.criado_em.replace(" ", "T")))}
                  {a.funcionario && ` · lavado por ${a.funcionario}`}
                  {a.cliente && ` · cliente: ${a.cliente}`}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta">
                  <span>Lavador <MostrarEstrelas nota={a.nota_funcionario} /></span>
                  <span>Atend. <MostrarEstrelas nota={a.nota_atendimento} /></span>
                  <span>Ambiente <MostrarEstrelas nota={a.nota_ambiente} /></span>
                </div>
                {a.comentario && <p className="mt-2 text-base text-tinta">“{a.comentario}”</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Moldura>
  );
}
