import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ChipStatus, IconeBusca } from "../componentes/fila";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, Confirmar, EstadoErro, EstadoVazio, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import {
  acaoFila,
  celularDaEntrada,
  emQuanto,
  hora,
  nomeDaEntrada,
  placaDaEntrada,
  STATUS_ESPERA,
  useFilaAoVivo,
  veiculoDaEntrada,
  type EntradaFila,
} from "../lib/fila";
import { duracao, linkWhatsApp, mascaraCelular, normalizarPlaca, primeiroNome, somenteDigitos, celularValido } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { Empresa, Servico, Vinculo } from "../lib/tipos";

type Pedido =
  | { tipo: "recusar" | "cancelar"; entrada: EntradaFila }
  | { tipo: "iniciar_fora_ordem"; entrada: EntradaFila; naFrente: number }
  | { tipo: "baixa"; entrada: EntradaFila };

const TEXTO_AVISO_PADRAO =
  "Faltam {minutos} minutos para a sua vez no {empresa}. Se quiser, já pode vir, temos café esperando!";

function mensagemAviso(empresa: Empresa, nome: string) {
  const texto = (empresa.textos_aviso?.aviso_vez || TEXTO_AVISO_PADRAO)
    .replaceAll("{minutos}", String(empresa.aviso_min ?? 15))
    .replaceAll("{empresa}", empresa.nome);
  return `Olá, ${primeiroNome(nome)}! ${texto}`;
}

function mensagemBusca(empresa: Empresa, nome: string) {
  return `Olá, ${primeiroNome(nome)}! Recebemos seu pedido de busca do carro no ${empresa.nome}. Vamos combinar o local e a taxa?`;
}

export function FilaEquipe() {
  const { empresa, vinculo } = useEmpresa();
  const { publica, entradas, erro, recarregar } = useFilaAoVivo(empresa.slug, empresa.id, true);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [balcao, setBalcao] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const gestao = pode(vinculo, "gerenciar_fila");

  if (!pode(vinculo, "ver_fila_completa")) return <Navigate to={`/${empresa.slug}`} replace />;

  const previsao = (id: string) => publica?.fila.find((f) => f.id === id);

  async function executar(entrada: EntradaFila, acao: string, body?: Record<string, unknown>) {
    setOcupado(entrada.id + acao);
    setErroAcao("");
    try {
      await acaoFila(entrada.id, acao, body);
      setPedido(null);
      recarregar();
    } catch (err) {
      setErroAcao(mensagemDeErro(err));
      setPedido(null);
      recarregar();
    } finally {
      setOcupado("");
    }
  }

  function iniciar(entrada: EntradaFila) {
    const naFrente = (entradas || []).filter((e) => STATUS_ESPERA.includes(e.status) && e.ordem < entrada.ordem).length;
    if (naFrente > 0) setPedido({ tipo: "iniciar_fora_ordem", entrada, naFrente });
    else executar(entrada, "iniciar");
  }

  function avisarWhatsApp(entrada: EntradaFila) {
    const cel = celularDaEntrada(entrada);
    window.open(linkWhatsApp(cel, mensagemAviso(empresa, nomeDaEntrada(entrada))), "_blank", "noopener");
    if (entrada.status === "confirmado") executar(entrada, "avisar");
  }

  const pendentes = entradas?.filter((e) => e.status === "pendente") || [];
  const naFila = entradas?.filter((e) => STATUS_ESPERA.includes(e.status) && e.status !== "pendente") || [];
  const lavando = entradas?.filter((e) => e.status === "lavando") || [];
  const prontos = entradas?.filter((e) => e.status === "pronto") || [];

  const btn = (entrada: EntradaFila, acao: string, rotulo: string, variante: "primario" | "secundario" | "perigo" | "fantasma" = "secundario", onClick?: () => void) => (
    <Botao variante={variante} carregando={ocupado === entrada.id + acao} disabled={!!ocupado} onClick={onClick || (() => executar(entrada, acao))}>
      {rotulo}
    </Botao>
  );

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Fila">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-tinta-suave">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-600" /> ao vivo · {publica?.capacidade ?? empresa.capacidade_simultanea} por vez
        </p>
        {gestao && (
          <Botao variante="secundario" onClick={() => setBalcao(true)}>
            + Balcão
          </Botao>
        )}
      </div>
      {erroAcao && (
        <div className="mt-4">
          <Aviso>{erroAcao}</Aviso>
        </div>
      )}
      {erro && entradas && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      {erro && !entradas ? (
        <EstadoErro texto={erro} tentar={recarregar} />
      ) : !entradas ? (
        <Carregando texto="Carregando a fila…" />
      ) : entradas.length === 0 ? (
        <div className="mt-6">
          <EstadoVazio titulo="Fila vazia" texto="Quando um cliente entrar pelo app ou no balcão, aparece aqui na hora." />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-7">
          {pendentes.length > 0 && (
            <Secao titulo={`Aguardando confirmação (${pendentes.length})`}>
              {pendentes.map((e) => (
                <CartaoEntrada key={e.id} entrada={e} posicao={previsao(e.id)?.posicao} previsaoIso={previsao(e.id)?.previsao} agora={publica?.agora}>
                  {e.quer_busca && celularDaEntrada(e) && (
                    <a
                      href={linkWhatsApp(celularDaEntrada(e), mensagemBusca(empresa, nomeDaEntrada(e)))}
                      target="_blank"
                      rel="noreferrer"
                      className="col-span-2 flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-4 font-bold text-white"
                    >
                      Combinar busca no WhatsApp
                    </a>
                  )}
                  {gestao ? (
                    <>
                      {btn(e, "confirmar", "Confirmar", "primario")}
                      {btn(e, "recusar", "Recusar", "secundario", () => setPedido({ tipo: "recusar", entrada: e }))}
                    </>
                  ) : (
                    <p className="col-span-2 text-sm text-tinta-suave">Quem confirma: patrão, gerente ou responsável pela fila.</p>
                  )}
                </CartaoEntrada>
              ))}
            </Secao>
          )}

          <Secao titulo={`Na fila (${naFila.length})`}>
            {naFila.length === 0 && <p className="text-base text-tinta-suave">Ninguém confirmado esperando.</p>}
            {naFila.map((e) => (
              <CartaoEntrada key={e.id} entrada={e} posicao={previsao(e.id)?.posicao} previsaoIso={previsao(e.id)?.previsao} agora={publica?.agora}>
                {celularDaEntrada(e) && (
                  <button
                    onClick={() => avisarWhatsApp(e)}
                    disabled={!!ocupado}
                    className="col-span-2 flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-4 font-bold text-white disabled:opacity-50"
                  >
                    {e.status === "avisado" ? "Avisar de novo no WhatsApp" : "Avisar no WhatsApp"}
                  </button>
                )}
                {e.status !== "no_local" && btn(e, "chegou", "Chegou")}
                {btn(e, "iniciar", "Iniciar lavagem", "primario", () => iniciar(e))}
                {gestao && <div className="col-span-2">{btn(e, "cancelar", "Cancelar", "fantasma", () => setPedido({ tipo: "cancelar", entrada: e }))}</div>}
              </CartaoEntrada>
            ))}
          </Secao>

          <Secao titulo={`Lavando (${lavando.length})`}>
            {lavando.length === 0 && <p className="text-base text-tinta-suave">Nenhum carro lavando.</p>}
            {lavando.map((e) => (
              <CartaoEntrada key={e.id} entrada={e} agora={publica?.agora}>
                {btn(e, "pronto", "Pronto")}
                {btn(e, "finalizar", "Dar baixa", "primario", () => setPedido({ tipo: "baixa", entrada: e }))}
              </CartaoEntrada>
            ))}
          </Secao>

          {prontos.length > 0 && (
            <Secao titulo={`Prontos para retirar (${prontos.length})`}>
              {prontos.map((e) => (
                <CartaoEntrada key={e.id} entrada={e} agora={publica?.agora}>
                  {celularDaEntrada(e) ? (
                    <a
                      href={linkWhatsApp(celularDaEntrada(e), `Olá, ${primeiroNome(nomeDaEntrada(e))}! Seu carro está pronto no ${empresa.nome}.`)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-12 items-center justify-center rounded-xl border-2 border-[#1f7a45] px-3 font-bold text-[#1f7a45]"
                    >
                      WhatsApp
                    </a>
                  ) : (
                    <span />
                  )}
                  {btn(e, "finalizar", "Dar baixa", "primario", () => setPedido({ tipo: "baixa", entrada: e }))}
                </CartaoEntrada>
              ))}
            </Secao>
          )}
        </div>
      )}

      {pedido?.tipo === "recusar" || pedido?.tipo === "cancelar" ? (
        <ConfirmarComMotivo
          titulo={`${pedido.tipo === "recusar" ? "Recusar" : "Cancelar"} ${primeiroNome(nomeDaEntrada(pedido.entrada))}?`}
          texto="A vaga sai da fila e todos abaixo sobem uma posição."
          rotulo={pedido.tipo === "recusar" ? "Recusar" : "Cancelar a vaga"}
          carregando={!!ocupado}
          onConfirmar={(motivo) => executar(pedido.entrada, pedido.tipo, { motivo })}
          onFechar={() => setPedido(null)}
        />
      ) : null}
      <Confirmar
        aberto={pedido?.tipo === "iniciar_fora_ordem"}
        titulo="Tem carro na frente"
        texto={
          pedido?.tipo === "iniciar_fora_ordem"
            ? `${pedido.naFrente} ${pedido.naFrente === 1 ? "carro está" : "carros estão"} antes deste na fila. Iniciar mesmo assim? Fica registrado.`
            : ""
        }
        rotuloConfirmar="Iniciar mesmo assim"
        carregando={!!ocupado}
        onConfirmar={() => pedido && executar(pedido.entrada, "iniciar")}
        onCancelar={() => setPedido(null)}
      />
      {pedido?.tipo === "baixa" && (
        <DarBaixa entrada={pedido.entrada} carregando={!!ocupado} onConfirmar={(lavador) => executar(pedido.entrada, "finalizar", { lavado_por: lavador })} onFechar={() => setPedido(null)} />
      )}
      {balcao && (
        <ClienteBalcao
          onFechar={() => setBalcao(false)}
          onSalvo={() => {
            setBalcao(false);
            recarregar();
          }}
        />
      )}
    </Moldura>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">{titulo}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function CartaoEntrada({
  entrada: e,
  posicao,
  previsaoIso,
  agora,
  children,
}: {
  entrada: EntradaFila;
  posicao?: number;
  previsaoIso?: string;
  agora?: string;
  children: ReactNode;
}) {
  const servico = e.expand?.servico;
  return (
    <article className="rounded-2xl border border-linha bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {posicao !== undefined && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fundo text-lg font-black text-tinta">{posicao}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-bold leading-tight text-tinta">{nomeDaEntrada(e)}</p>
            <ChipStatus status={e.status} />
          </div>
          <p className="mt-0.5 text-base text-tinta">
            <span className="font-mono font-bold">{placaDaEntrada(e)}</span>
            {veiculoDaEntrada(e) && <span className="text-tinta-suave"> · {veiculoDaEntrada(e)}</span>}
          </p>
          <p className="text-base text-tinta-suave">
            {servico?.nome}
            {e.duracao_min ? ` · ~${duracao(e.duracao_min)}` : ""}
            {previsaoIso && ` · início ${hora(previsaoIso)} (${emQuanto(previsaoIso, agora)})`}
            {e.status === "lavando" && e.inicio_em && ` · desde ${hora(e.inicio_em)}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {e.quer_busca && <IconeBusca />}
            {e.origem === "balcao" && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-bold text-gray-700">Balcão</span>}
          </div>
          {e.observacao && <p className="mt-2 rounded-xl bg-fundo px-3 py-2 text-base text-tinta">“{e.observacao}”</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">{children}</div>
    </article>
  );
}

function ConfirmarComMotivo({
  titulo,
  texto,
  rotulo,
  carregando,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  texto: string;
  rotulo: string;
  carregando: boolean;
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Folha titulo={titulo} onFechar={onFechar}>
      <p className="text-base text-tinta-suave">{texto}</p>
      <div className="mt-4">
        <Campo rotulo="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <Botao variante="perigo" largo carregando={carregando} onClick={() => onConfirmar(motivo.trim())}>
          {rotulo}
        </Botao>
        <Botao variante="secundario" largo onClick={onFechar} disabled={carregando}>
          Voltar
        </Botao>
      </div>
    </Folha>
  );
}

function DarBaixa({
  entrada,
  carregando,
  onConfirmar,
  onFechar,
}: {
  entrada: EntradaFila;
  carregando: boolean;
  onConfirmar: (lavador: string) => void;
  onFechar: () => void;
}) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const [equipe, setEquipe] = useState<Vinculo[] | null>(null);
  const [lavador, setLavador] = useState(usuario?.id || "");

  useEffect(() => {
    pb.collection("vinculos")
      .getFullList<Vinculo>({
        filter: pb.filter('empresa = {:e} && ativo = true && papel != "cliente"', { e: empresa.id }),
        expand: "usuario",
      })
      .then((v) => setEquipe(v.sort((a, b) => (a.expand?.usuario?.nome || "").localeCompare(b.expand?.usuario?.nome || "", "pt-BR"))))
      .catch(() => setEquipe([]));
  }, [empresa.id]);

  return (
    <Folha titulo="Dar baixa" onFechar={onFechar}>
      <p className="text-base text-tinta">
        <strong>{nomeDaEntrada(entrada)}</strong> · <span className="font-mono">{placaDaEntrada(entrada)}</span>
      </p>
      <fieldset className="mt-4">
        <legend className="mb-2 text-base font-bold text-tinta">Quem lavou?</legend>
        {equipe === null ? (
          <Carregando />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {equipe.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={lavador === v.usuario}
                onClick={() => setLavador(v.usuario)}
                className={`min-h-12 rounded-xl border-2 px-3 text-base font-bold ${lavador === v.usuario ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
              >
                {primeiroNome(v.expand?.usuario?.nome || "")}
                {v.usuario === usuario?.id ? " (eu)" : ""}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      <Botao largo className="mt-5" carregando={carregando} disabled={!lavador} onClick={() => onConfirmar(lavador)}>
        Confirmar: carro lavado
      </Botao>
    </Folha>
  );
}

function ClienteBalcao({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const [servicos, setServicos] = useState<Servico[] | null>(null);
  const [servico, setServico] = useState("");
  const [nome, setNome] = useState("");
  const [finalPlaca, setFinalPlaca] = useState("");
  const [veiculo, setVeiculo] = useState("");
  const [celular, setCelular] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    pb.collection("servicos")
      .getFullList<Servico>({ filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), sort: "ordem_exibicao,nome" })
      .then(setServicos)
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [empresa.id]);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro("Digite o nome do cliente.");
    if (finalPlaca.length !== 3) return setErro("Digite os 3 últimos caracteres da placa.");
    if (celular && !celularValido(celular)) return setErro("Celular inválido. Use DDD + número.");
    if (!servico) return setErro("Escolha o serviço.");
    setEnviando(true);
    try {
      await pb.send("/api/lr/fila/balcao", {
        method: "POST",
        body: { empresa: empresa.id, servico, nome: nome.trim(), final_placa: finalPlaca, veiculo_desc: veiculo.trim(), celular: somenteDigitos(celular) },
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha titulo="Cliente no balcão" onFechar={onFechar}>
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <p className="text-base text-tinta-suave">Entra confirmado, no fim da fila.</p>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Final da placa"
            placeholder="D23"
            maxLength={3}
            autoCapitalize="characters"
            value={finalPlaca}
            onChange={(e) => setFinalPlaca(normalizarPlaca(e.target.value).slice(0, 3))}
          />
          <Campo rotulo="Carro" placeholder="Onix prata" value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />
        </div>
        <Campo
          rotulo="Celular (opcional)"
          type="tel"
          inputMode="numeric"
          value={celular}
          onChange={(e) => setCelular(mascaraCelular(e.target.value))}
          ajuda="Para avisar pelo WhatsApp."
        />
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Serviço</legend>
          {servicos === null ? (
            <Carregando />
          ) : servicos.length === 0 ? (
            <p className="text-base text-tinta-suave">Cadastre os serviços em Configurações.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {servicos.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={servico === s.id}
                  onClick={() => setServico(s.id)}
                  className={`min-h-12 rounded-xl border-2 px-3 py-2 text-base font-bold ${servico === s.id ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
                >
                  {s.nome}
                </button>
              ))}
            </div>
          )}
        </fieldset>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={enviando}>
          Colocar na fila
        </Botao>
      </form>
    </Folha>
  );
}
