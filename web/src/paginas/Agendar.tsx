import { CenaLavagem } from "../componentes/Marca";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { descricaoVeiculo, useMeusVeiculos } from "../componentes/MeusVeiculos";
import { Moldura } from "../componentes/Moldura";
import { precoPara, tiposDaEmpresa } from "../componentes/TipoVeiculo";
import { Aviso, Botao, Campo, Carregando, Confirmar } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { diaHora, duracao, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { textoPorte, tipoDoCarro } from "../lib/porteVeiculo";
import type { Agendamento, Orcamento, Servico } from "../lib/tipos";

// Agendamento pelo cliente: ele PEDE o dia e o horário. A equipe confirma no horário, sugere outro,
// coloca na sequência da fila ou recusa. Só vira lugar na fila depois da resposta da equipe.

const OFFSET = 3 * 3600000;
// "AAAA-MM-DDTHH:MM" de amanhã às 9h (horário de São Paulo), para o campo de data e hora.
function amanha9h() {
  const d = new Date(Date.now() - OFFSET + 86400000);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}
const localParaIso = (v: string) => new Date(`${v}:00-03:00`).toISOString();

const STATUS: Record<Agendamento["status"], string> = {
  pedido: "Esperando a resposta do lava rápido",
  confirmado: "Confirmado",
  recusado: "Não deu",
  cancelado: "Cancelado por você",
};
const COMO: Record<string, string> = {
  no_horario: "no horário que você pediu",
  outro_horario: "em outro horário",
  na_fila: "na sequência da fila",
};

export function Agendar() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario } = useSessao();
  const [busca] = useSearchParams();
  const idOrcamento = busca.get("orcamento") || "";
  const { veiculos } = useMeusVeiculos();
  const [servicos, setServicos] = useState<Servico[] | null>(null);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [servico, setServico] = useState("");
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const [quando, setQuando] = useState(amanha9h());
  const [obs, setObs] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [pedidos, setPedidos] = useState<Agendamento[] | null>(null);
  const [cancelando, setCancelando] = useState<Agendamento | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!usuario) return;
    try {
      const [s, p] = await Promise.all([
        pb.collection("servicos").getFullList<Servico>({ filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), sort: "ordem_exibicao,nome" }),
        pb.collection("agendamentos").getFullList<Agendamento>({
          filter: pb.filter("empresa = {:e} && cliente = {:c}", { e: empresa.id, c: usuario.id }),
          sort: "-created",
          expand: "servico,veiculos",
        }),
      ]);
      setServicos(s);
      setPedidos(p);
      if (idOrcamento) {
        const o = await pb.collection("orcamentos").getOne<Orcamento>(idOrcamento, { expand: "servico" });
        if (o.status === "aceito") {
          setOrcamento(o);
          setServico(o.servico);
          setMarcados([o.veiculo]);
        }
      }
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, usuario, idOrcamento]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;
  if (vinculo?.papel !== "cliente") return <Navigate to={`/${empresa.slug}`} replace />;

  const tipos = tiposDaEmpresa(empresa);
  const escolhidos = marcados ?? (veiculos?.length === 1 ? [veiculos[0].id] : []);
  const carros = escolhidos
    .map((id) => veiculos?.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => !!v)
    .map((v) => ({ v, ...tipoDoCarro(tipos, vinculo, v) }));
  const lista = (servicos || []).filter((s) => !s.sob_orcamento || s.id === orcamento?.servico);
  const servicoEscolhido = servicos?.find((s) => s.id === servico);
  const precoDo = (s: Servico, tipoId?: string) => (orcamento && s.id === orcamento.servico ? orcamento.valor : precoPara(s, tipoId));

  function alternar(id: string) {
    if (orcamento) return;
    setErro("");
    if (escolhidos.includes(id)) return setMarcados(escolhidos.filter((x) => x !== id));
    if (escolhidos.length >= 3) return setErro("No máximo 3 carros por vez.");
    setMarcados([...escolhidos, id]);
  }
  function conferir() {
    setErro("");
    setMsg("");
    if (!escolhidos.length) return setErro("Escolha o carro.");
    if (!servico) return setErro("Escolha o serviço.");
    if (!quando) return setErro("Escolha o dia e o horário.");
    if (new Date(localParaIso(quando)).getTime() < Date.now() + 10 * 60000) return setErro("Escolha um horário daqui a pelo menos 10 minutos.");
    setConferindo(true);
  }
  async function enviar() {
    setEnviando(true);
    setErro("");
    try {
      await pb.send("/api/lr/agendar", {
        method: "POST",
        body: { slug: empresa.slug, servico, veiculos: escolhidos, horario: localParaIso(quando), observacao: obs.trim(), orcamento: orcamento?.id || "" },
      });
      setConferindo(false);
      setMarcados(null);
      setObs("");
      setMsg("Pedido enviado! O lava rápido responde aqui e no aviso do celular.");
      carregar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErro(mensagemDeErro(err));
      setConferindo(false);
    } finally {
      setEnviando(false);
    }
  }
  async function cancelar() {
    if (!cancelando) return;
    try {
      await pb.send(`/api/lr/agendamentos/${cancelando.id}/cancelar`, { method: "POST" });
      setCancelando(null);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setCancelando(null);
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Agendar horário">
      <div className="mb-5">
        <CenaLavagem titulo="Reserve o seu horário" texto="Escolha o dia e a hora. O lava rápido confirma pelo app." />
      </div>
      {msg && <Aviso tipo="sucesso">{msg}</Aviso>}
      {pedidos && pedidos.length > 0 && (
        <section className="mb-5" aria-labelledby="titulo-pedidos">
          <h2 id="titulo-pedidos" className="mb-2 text-lg font-extrabold text-tinta">
            Meus pedidos de horário
          </h2>
          <ul className="flex flex-col gap-2">
            {pedidos.slice(0, 6).map((p) => (
              <li key={p.id} className={`rounded-2xl border-2 bg-white p-4 ${p.status === "confirmado" ? "border-green-600" : p.status === "pedido" ? "border-amber-300" : "border-linha"}`}>
                <p className="text-base font-extrabold text-tinta">{STATUS[p.status]}</p>
                <p className="text-base text-tinta">
                  {p.expand?.servico?.nome} · {p.expand?.veiculos?.map((v) => v.modelo || `…${v.final_placa}`).join(", ")}
                </p>
                <p className="text-sm text-tinta-suave">
                  Pedido para {diaHora(p.horario_pedido)}
                  {p.status === "confirmado" && (p.horario_confirmado ? ` · confirmado para ${diaHora(p.horario_confirmado)}` : ` · ${COMO[p.como] || ""}`)}
                </p>
                {p.resposta && <p className="mt-1 rounded-xl bg-fundo px-3 py-2 text-base text-tinta">“{p.resposta}”</p>}
                {p.status === "pedido" && (
                  <button type="button" onClick={() => setCancelando(p)} className="mt-2 min-h-11 rounded-xl px-2 text-sm font-bold text-red-700 underline">
                    Desistir do pedido
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {servicos === null ? (
        <Carregando />
      ) : conferindo && servicoEscolhido ? (
        <section className="flex flex-col gap-4" aria-labelledby="titulo-conferir">
          <h2 id="titulo-conferir" className="text-lg font-extrabold text-tinta">
            Confira o pedido
          </h2>
          <p className="text-base text-tinta">
            Pedido para <strong>{diaHora(localParaIso(quando))}</strong>. O lava rápido confirma, sugere outro horário ou te coloca na sequência da fila.
          </p>
          {carros.map(({ v, tipo }) => (
            <div key={v.id} className="rounded-2xl border-2 border-linha bg-white p-4">
              <p className="text-lg font-extrabold text-tinta">{descricaoVeiculo(v)}</p>
              <p className="text-sm text-tinta-suave">{tipo ? tipo.nome : v.porte ? textoPorte(v.porte) : "Tamanho: o lava rápido confere"}</p>
              <p className="mt-2 flex items-baseline justify-between gap-3 text-base text-tinta">
                <span>{servicoEscolhido.nome}</span>
                <strong className="text-xl">{reais(precoDo(servicoEscolhido, tipo?.id))}</strong>
              </p>
            </div>
          ))}
          <p className="text-base text-tinta">
            <strong>Cada carro tem o seu valor e paga separado</strong>, no lava rápido, quando ficar pronto.
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao largo carregando={enviando} onClick={enviar}>
            Enviar pedido de horário
          </Botao>
          <Botao variante="secundario" largo disabled={enviando} onClick={() => setConferindo(false)}>
            Voltar e mudar
          </Botao>
        </section>
      ) : (
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-extrabold text-tinta">Novo pedido</h2>
          {orcamento && (
            <p className="rounded-xl bg-marca-suave px-4 py-3 text-base text-tinta">
              Orçamento aceito: <strong>{orcamento.expand?.servico?.nome || "serviço"}</strong> por <strong>{reais(orcamento.valor)}</strong>
            </p>
          )}
          <fieldset>
            <legend className="mb-2 text-base font-bold text-tinta">Carro (até 3)</legend>
            <div className="flex flex-col gap-2">
              {veiculos?.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="checkbox"
                  aria-checked={escolhidos.includes(v.id)}
                  disabled={!!orcamento && !escolhidos.includes(v.id)}
                  onClick={() => alternar(v.id)}
                  className={`min-h-14 rounded-2xl border-2 px-4 py-3 text-left text-base font-bold text-tinta disabled:opacity-50 ${escolhidos.includes(v.id) ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
                >
                  {escolhidos.includes(v.id) ? "✓ " : ""}
                  {descricaoVeiculo(v)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-base font-bold text-tinta">Serviço</legend>
            <div className="flex flex-col gap-2">
              {lista.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={servico === s.id}
                  onClick={() => !orcamento && setServico(s.id)}
                  className={`min-h-14 rounded-2xl border-2 px-4 py-3 text-left ${servico === s.id ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-bold text-tinta">{s.nome}</span>
                    {carros.length <= 1 && <span className="text-base font-bold text-tinta">{reais(precoDo(s, carros[0]?.tipo?.id))}</span>}
                  </span>
                  {carros.length > 1 &&
                    carros.map(({ v, tipo }) => (
                      <span key={v.id} className="flex items-baseline justify-between gap-3 text-sm text-tinta">
                        <span>{v.modelo || `…${v.final_placa}`}</span>
                        <strong>{reais(precoDo(s, tipo?.id))}</strong>
                      </span>
                    ))}
                  <span className="block text-sm text-tinta-suave">~{duracao(s.duracao_media_min)}</span>
                </button>
              ))}
            </div>
            {(servicos || []).some((s) => s.sob_orcamento) && !orcamento && (
              <p className="mt-2 text-sm text-tinta-suave">Polimento e outros serviços sob orçamento: peça o orçamento primeiro, no menu inicial.</p>
            )}
          </fieldset>
          <Campo rotulo="Dia e horário que você quer" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} ajuda="Até 30 dias para a frente." />
          <Campo rotulo="Observação (opcional)" maxLength={300} placeholder="Ex.: pode ser de manhã" value={obs} onChange={(e) => setObs(e.target.value)} />
          {erro && <Aviso>{erro}</Aviso>}
          <Botao largo onClick={conferir}>
            Conferir antes de enviar
          </Botao>
        </div>
      )}
      <Confirmar
        aberto={!!cancelando}
        titulo="Desistir deste pedido?"
        texto="O lava rápido deixa de ver o pedido."
        rotuloConfirmar="Desistir"
        perigo
        onConfirmar={cancelar}
        onCancelar={() => setCancelando(null)}
      />
    </Moldura>
  );
}
