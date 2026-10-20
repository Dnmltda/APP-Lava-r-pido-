import { useEffect, useState } from "react";
import { ListaFilaPublica, IconeBusca } from "../componentes/fila";
import { descricaoVeiculo, NovoVeiculo, useMeusVeiculos } from "../componentes/MeusVeiculos";
import { Aviso, Botao, Carregando, Cartao, Confirmar, EstadoErro, Folha, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { acaoFila, emQuanto, hora, useFilaAoVivo, type ItemPublico } from "../lib/fila";
import { duracao, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import type { Servico, StatusFila } from "../lib/tipos";

const MENSAGEM_STATUS: Partial<Record<StatusFila, { titulo: string; texto: string }>> = {
  pendente: { titulo: "Aguardando confirmação", texto: "O lava rápido vai confirmar sua vez. Você não perde o lugar enquanto isso." },
  confirmado: { titulo: "Sua vez foi confirmada", texto: "Acompanhe a previsão por aqui. Avisamos quando estiver chegando a hora." },
  avisado: { titulo: "Já pode vir!", texto: "Sua vez está chegando." },
  no_local: { titulo: "Você está no local", texto: "Seu carro entra assim que abrir uma vaga." },
  lavando: { titulo: "Seu carro está sendo lavado", texto: "Falta pouco." },
  pronto: { titulo: "Pronto! Pode retirar", texto: "Seu carro está te esperando." },
};

export function FilaCliente() {
  const { empresa } = useEmpresa();
  const { publica, erro, recarregar } = useFilaAoVivo(empresa.slug, empresa.id);
  const [entrando, setEntrando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState("");

  if (erro && !publica) return <EstadoErro texto={erro} tentar={recarregar} />;
  if (!publica) return <Carregando texto="Carregando a fila…" />;

  const minha: ItemPublico | undefined = [...publica.lavando, ...publica.fila, ...publica.prontos].find((i) => i.minha);
  const info = minha && MENSAGEM_STATUS[minha.status];

  async function cancelar() {
    if (!minha) return;
    setOcupado(true);
    setErroAcao("");
    try {
      await acaoFila(minha.id, "cancelar");
      setCancelando(false);
      recarregar();
    } catch (err) {
      setErroAcao(mensagemDeErro(err));
      setCancelando(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {minha && info ? (
        <div className="rounded-3xl bg-marca p-5 text-sobre-marca shadow-lg">
          <p className="text-sm font-bold uppercase tracking-wide opacity-85">Sua vez</p>
          <p className="mt-1 text-2xl font-black leading-tight">{info.titulo}</p>
          {minha.posicao !== undefined && (
            <div className="mt-4 flex items-end gap-6">
              <div>
                <p className="text-5xl font-black leading-none">{minha.posicao}º</p>
                <p className="mt-1 text-sm opacity-85">na fila</p>
              </div>
              {minha.previsao && (
                <div>
                  <p className="text-3xl font-black leading-none">{hora(minha.previsao)}</p>
                  <p className="mt-1 text-sm opacity-85">previsão · {emQuanto(minha.previsao, publica.agora)}</p>
                </div>
              )}
            </div>
          )}
          <p className="mt-4 text-base opacity-95">{info.texto}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-black/15 px-3 py-1 text-sm font-bold">{minha.servico}</span>
            {minha.quer_busca && <IconeBusca />}
          </div>
          {minha.posicao !== undefined && (
            <button
              onClick={() => setCancelando(true)}
              className="mt-4 min-h-12 w-full rounded-xl border-2 border-current/40 px-4 text-base font-bold hover:bg-black/10"
            >
              Cancelar minha vez
            </button>
          )}
        </div>
      ) : (
        <Cartao>
          <p className="text-lg font-bold text-tinta">
            {publica.fila.length === 0 ? "Sem fila agora" : `${publica.fila.length} ${publica.fila.length === 1 ? "carro" : "carros"} na fila`}
          </p>
          <p className="mt-1 text-base text-tinta-suave">
            Entrando agora, a previsão é <strong className="text-tinta">{hora(publica.proxima_vaga)}</strong> ({emQuanto(publica.proxima_vaga, publica.agora)}).
          </p>
          <Botao largo className="mt-4" onClick={() => setEntrando(true)}>
            Entrar na fila
          </Botao>
        </Cartao>
      )}
      {erroAcao && <Aviso>{erroAcao}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-tinta">Fila ao vivo</h2>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-tinta-suave">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-600" /> atualiza sozinha
          </span>
        </div>
        <ListaFilaPublica fila={publica} />
      </section>

      {entrando && (
        <EntrarNaFila
          onFechar={() => setEntrando(false)}
          onEntrou={() => {
            setEntrando(false);
            recarregar();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
      <Confirmar
        aberto={cancelando}
        titulo="Cancelar sua vez?"
        texto="Você sai da fila. Se quiser voltar depois, entra de novo no fim."
        rotuloConfirmar="Sim, cancelar"
        perigo
        carregando={ocupado}
        onConfirmar={cancelar}
        onCancelar={() => setCancelando(false)}
      />
    </div>
  );
}

function EntrarNaFila({ onFechar, onEntrou }: { onFechar: () => void; onEntrou: () => void }) {
  const { empresa } = useEmpresa();
  const { veiculos, recarregar } = useMeusVeiculos();
  const [servicos, setServicos] = useState<Servico[] | null>(null);
  const [servico, setServico] = useState("");
  const [veiculo, setVeiculo] = useState("");
  const [busca, setBusca] = useState(false);
  const [obs, setObs] = useState("");
  const [novoVeiculo, setNovoVeiculo] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    pb.collection("servicos")
      .getFullList<Servico>({ filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), sort: "ordem_exibicao,nome" })
      .then(setServicos)
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [empresa.id]);

  const veiculoEscolhido = veiculo || (veiculos?.length === 1 ? veiculos[0].id : "");

  async function confirmar() {
    setErro("");
    if (!servico) return setErro("Escolha o serviço.");
    if (!veiculoEscolhido) return setErro("Escolha o veículo.");
    setEnviando(true);
    try {
      await pb.send("/api/lr/fila/entrar", {
        method: "POST",
        body: { slug: empresa.slug, servico, veiculo: veiculoEscolhido, quer_busca: busca, observacao: obs.trim() },
      });
      onEntrou();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  if (novoVeiculo) {
    return (
      <NovoVeiculo
        onFechar={() => setNovoVeiculo(false)}
        onSalvo={(v) => {
          setNovoVeiculo(false);
          setVeiculo(v.id);
          recarregar();
        }}
      />
    );
  }

  return (
    <Folha titulo="Entrar na fila" onFechar={onFechar}>
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Serviço</legend>
          {servicos === null ? (
            <Carregando />
          ) : servicos.length === 0 ? (
            <p className="text-base text-tinta-suave">Nenhum serviço disponível no momento.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {servicos.map((s) => (
                <Opcao key={s.id} marcada={servico === s.id} onClick={() => setServico(s.id)}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-bold text-tinta">{s.nome}</span>
                    <span className="text-base font-bold text-tinta">{reais(s.preco)}</span>
                  </span>
                  <span className="block text-sm text-tinta-suave">
                    ~{duracao(s.duracao_media_min)}
                    {s.descricao ? ` · ${s.descricao}` : ""}
                  </span>
                </Opcao>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Veículo</legend>
          <div className="flex flex-col gap-2">
            {veiculos?.map((v) => (
              <Opcao key={v.id} marcada={veiculoEscolhido === v.id} onClick={() => setVeiculo(v.id)}>
                <span className="text-base font-bold text-tinta">{descricaoVeiculo(v)}</span>
              </Opcao>
            ))}
            <button type="button" onClick={() => setNovoVeiculo(true)} className="min-h-12 self-start rounded-xl px-2 text-base font-bold text-marca-forte">
              + Outro veículo
            </button>
          </div>
        </fieldset>

        <Interruptor
          rotulo="Quero que busquem meu carro"
          descricao="O lava rápido chama você no WhatsApp para combinar local e taxa."
          ligado={busca}
          onChange={setBusca}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="obs" className="text-base font-semibold text-tinta">
            Observação (opcional)
          </label>
          <textarea
            id="obs"
            rows={2}
            maxLength={300}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base focus:border-marca focus:outline-none"
          />
        </div>

        <p className="text-sm text-tinta-suave">O pagamento é feito no lava rápido, na hora.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando} onClick={confirmar}>
          Confirmar e entrar na fila
        </Botao>
      </div>
    </Folha>
  );
}

function Opcao({ marcada, onClick, children }: { marcada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      onClick={onClick}
      className={`min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left ${marcada ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
    >
      {children}
    </button>
  );
}
