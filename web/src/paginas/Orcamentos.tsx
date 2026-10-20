import { Camera } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { descricaoVeiculo, useMeusVeiculos } from "../componentes/MeusVeiculos";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoVazio, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { dia, diaHora, duracao, linkWhatsApp, reais } from "../lib/formato";
import { comprimirImagem } from "../lib/imagem";
import { mensagemDeErro, pb, urlProtegida } from "../lib/pb";
import type { Orcamento, Servico } from "../lib/tipos";

// Orçamento (polimento, higienização, etc.). O cliente pede (com fotos, se quiser); o dono ou o
// gerente respondem o valor; o cliente aceita ou recusa; aceito, ele pede o horário.
// Nenhum valor vale antes de a equipe responder.

const STATUS: Record<Orcamento["status"], string> = {
  pedido: "Esperando o lava rápido",
  respondido: "Orçamento respondido",
  aceito: "Aceito",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

function useToken() {
  const [token, setToken] = useState("");
  useEffect(() => {
    pb.files.getToken().then(setToken).catch(() => {});
  }, []);
  return token;
}

function Fotos({ o, token }: { o: Orcamento; token: string }) {
  if (!o.fotos?.length || !token) return null;
  return (
    <div className="mt-2 grid grid-cols-4 gap-2">
      {o.fotos.map((f) => (
        <a key={f} href={urlProtegida(o, f, token)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-fundo">
          <img src={urlProtegida(o, f, token)} alt="Foto do carro" className="aspect-square w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

export function Orcamentos() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario } = useSessao();
  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;
  if (vinculo?.papel === "cliente") return <OrcamentosCliente />;
  if (vinculo?.papel === "patrao" || vinculo?.papel === "gerente") return <OrcamentosEquipe />;
  return <Navigate to={`/${empresa.slug}`} replace />;
}

// ---------------------------------------------------------------- cliente
function OrcamentosCliente() {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const token = useToken();
  const [lista, setLista] = useState<Orcamento[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLista(
        await pb.collection("orcamentos").getFullList<Orcamento>({
          filter: pb.filter("empresa = {:e} && cliente = {:c}", { e: empresa.id, c: usuario!.id }),
          sort: "-created",
          expand: "servico,veiculo",
        }),
      );
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, usuario]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function decidir(o: Orcamento, aceitar: boolean) {
    setOcupado(o.id);
    setErro("");
    try {
      await pb.send(`/api/lr/orcamentos/${o.id}/decidir`, { method: "POST", body: { aceitar } });
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setOcupado("");
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Orçamentos">
      <p className="text-base text-tinta-suave">Para polimento, higienização e outros serviços que dependem do carro. O lava rápido responde o valor aqui.</p>
      <Botao largo className="mt-4" onClick={() => setNovo(true)}>
        Pedir orçamento
      </Botao>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="mt-5 flex flex-col gap-3">
        {lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Nenhum orçamento ainda" texto="Peça um orçamento e acompanhe a resposta por aqui." />
        ) : (
          lista.map((o) => (
            <article key={o.id} className={`rounded-2xl border-2 bg-white p-4 ${o.status === "respondido" ? "border-marca" : o.status === "aceito" ? "border-green-600" : "border-linha"}`}>
              <p className="text-base font-extrabold text-tinta">{STATUS[o.status]}</p>
              <p className="text-base text-tinta">
                {o.expand?.servico?.nome || "Orçamento"} · {o.expand?.veiculo ? descricaoVeiculo(o.expand.veiculo) : ""}
              </p>
              <p className="mt-1 text-sm text-tinta-suave">“{o.descricao}”</p>
              <Fotos o={o} token={token} />
              {(o.status === "respondido" || o.status === "aceito") && (
                <div className="mt-3 rounded-xl bg-fundo p-3">
                  <p className="flex items-baseline justify-between gap-3 text-base text-tinta">
                    <span>Valor para este carro</span>
                    <strong className="text-xl">{reais(o.valor)}</strong>
                  </p>
                  {o.duracao_min > 0 && <p className="text-sm text-tinta-suave">Tempo: ~{duracao(o.duracao_min)}</p>}
                  {o.resposta && <p className="mt-1 text-base text-tinta">{o.resposta}</p>}
                  {o.status === "respondido" && <p className="mt-1 text-sm text-tinta-suave">Vale até {dia(o.validade)}. Pagamento no lava rápido.</p>}
                </div>
              )}
              {o.status === "respondido" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Botao carregando={ocupado === o.id} onClick={() => decidir(o, true)}>
                    Aceitar
                  </Botao>
                  <Botao variante="secundario" disabled={ocupado === o.id} onClick={() => decidir(o, false)}>
                    Recusar
                  </Botao>
                </div>
              )}
              {o.status === "aceito" && (
                <Link to={`/${empresa.slug}/agendar?orcamento=${o.id}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-marca px-4 font-bold text-sobre-marca">
                  Pedir o horário
                </Link>
              )}
            </article>
          ))
        )}
      </div>
      {novo && (
        <PedirOrcamento
          onFechar={() => setNovo(false)}
          onPedido={() => {
            setNovo(false);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function PedirOrcamento({ onFechar, onPedido }: { onFechar: () => void; onPedido: () => void }) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const { veiculos } = useMeusVeiculos();
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [veiculo, setVeiculo] = useState("");
  const [servico, setServico] = useState("");
  const [descricao, setDescricao] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    pb.collection("servicos")
      .getFullList<Servico>({ filter: pb.filter("empresa = {:e} && ativo = true && sob_orcamento = true", { e: empresa.id }), sort: "ordem_exibicao,nome" })
      .then(setServicos)
      .catch(() => {});
  }, [empresa.id]);
  const escolhido = veiculo || (veiculos?.length === 1 ? veiculos[0].id : "");
  async function enviar() {
    setErro("");
    if (!escolhido) return setErro("Escolha o carro.");
    if (descricao.trim().length < 3) return setErro("Conte o que você quer (ex.: polimento, riscos na porta).");
    setEnviando(true);
    try {
      const f = new FormData();
      f.append("empresa", empresa.id);
      f.append("cliente", usuario!.id);
      f.append("veiculo", escolhido);
      if (servico) f.append("servico", servico);
      f.append("descricao", descricao.trim());
      f.append("status", "pedido");
      for (const a of fotos.slice(0, 4)) f.append("fotos", await comprimirImagem(a));
      await pb.collection("orcamentos").create(f);
      onPedido();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Folha titulo="Pedir orçamento" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Carro</legend>
          <div className="flex flex-col gap-2">
            {veiculos?.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={escolhido === v.id}
                onClick={() => setVeiculo(v.id)}
                className={`min-h-14 rounded-2xl border-2 px-4 py-3 text-left text-base font-bold text-tinta ${escolhido === v.id ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
              >
                {descricaoVeiculo(v)}
              </button>
            ))}
          </div>
        </fieldset>
        {servicos.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-base font-bold text-tinta">Serviço (opcional)</legend>
            <div className="flex flex-wrap gap-2">
              {[{ id: "", nome: "Outro" }, ...servicos].map((s) => (
                <button
                  key={s.id || "outro"}
                  type="button"
                  role="radio"
                  aria-checked={servico === s.id}
                  onClick={() => setServico(s.id)}
                  className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold ${servico === s.id ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
                >
                  {s.nome}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="desc-orc" className="text-base font-semibold text-tinta">
            O que você quer
          </label>
          <textarea
            id="desc-orc"
            rows={3}
            maxLength={600}
            placeholder="Ex.: polimento completo, tem uns riscos na porta do motorista"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base focus:border-marca focus:outline-none"
          />
        </div>
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-marca px-4 text-base font-bold text-marca-forte">
          <Camera className="h-5 w-5" aria-hidden="true" />
          {fotos.length ? `${fotos.length} foto(s)` : "Mandar fotos (opcional, até 4)"}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFotos(Array.from(e.target.files || []).slice(0, 4))} />
        </label>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando} onClick={enviar}>
          Enviar pedido de orçamento
        </Botao>
        <p className="text-sm text-tinta-suave">O valor só vale depois que o lava rápido responder. Você aceita ou recusa aqui.</p>
      </div>
    </Folha>
  );
}

// ---------------------------------------------------------- dono e gerente
function OrcamentosEquipe() {
  const { empresa } = useEmpresa();
  const token = useToken();
  const [lista, setLista] = useState<Orcamento[] | null>(null);
  const [respondendo, setRespondendo] = useState<Orcamento | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      setLista(
        await pb.collection("orcamentos").getFullList<Orcamento>({
          filter: pb.filter("empresa = {:e} && status != 'cancelado'", { e: empresa.id }),
          sort: "-created",
          expand: "cliente,servico,veiculo",
        }),
      );
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  const abertos = (lista || []).filter((o) => o.status === "pedido");
  const outros = (lista || []).filter((o) => o.status !== "pedido").slice(0, 30);
  const cartao = (o: Orcamento) => (
    <article key={o.id} className={`rounded-2xl border-2 bg-white p-4 ${o.status === "pedido" ? "border-amber-300" : "border-linha"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-extrabold text-tinta">{o.expand?.cliente?.nome}</p>
        <span className="text-sm font-bold text-tinta-suave">{STATUS[o.status]}</span>
      </div>
      <p className="text-base text-tinta">
        {o.expand?.servico?.nome || "Outro"} · {o.expand?.veiculo ? descricaoVeiculo(o.expand.veiculo) : ""}
      </p>
      <p className="mt-1 text-base text-tinta">“{o.descricao}”</p>
      <p className="text-sm text-tinta-suave">Pedido em {diaHora(o.created)}</p>
      <Fotos o={o} token={token} />
      {o.status !== "pedido" && o.valor > 0 && <p className="mt-2 text-base text-tinta">Respondido: <strong>{reais(o.valor)}</strong></p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(o.status === "pedido" || o.status === "respondido") && (
          <Botao onClick={() => setRespondendo(o)}>{o.status === "pedido" ? "Responder valor" : "Mudar valor"}</Botao>
        )}
        {o.expand?.cliente?.celular && (
          <a
            href={linkWhatsApp(o.expand.cliente.celular, `Olá, ${o.expand.cliente.nome.split(" ")[0]}! Sobre o seu orçamento no ${empresa.nome}:`)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-3 text-sm font-bold text-white"
          >
            WhatsApp
          </a>
        )}
      </div>
    </article>
  );
  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Orçamentos">
      {erro && <Aviso>{erro}</Aviso>}
      <p className="text-base text-tinta-suave">
        Para o cliente pedir orçamento de um serviço, marque “Sob orçamento” em <Link to={`/${empresa.slug}/servicos`} className="font-bold text-marca-forte underline">Serviços</Link>. Ele também pode pedir “Outro”.
      </p>
      <h2 className="mt-4 text-lg font-extrabold text-tinta">Para responder ({abertos.length})</h2>
      <div className="mt-2 flex flex-col gap-3">
        {lista === null ? <Carregando /> : abertos.length === 0 ? <p className="text-base text-tinta-suave">Nenhum pedido esperando.</p> : abertos.map(cartao)}
      </div>
      {outros.length > 0 && (
        <>
          <h2 className="mt-6 text-lg font-extrabold text-tinta">Respondidos</h2>
          <div className="mt-2 flex flex-col gap-3">{outros.map(cartao)}</div>
        </>
      )}
      {respondendo && (
        <Responder
          orcamento={respondendo}
          onFechar={() => setRespondendo(null)}
          onFeito={() => {
            setRespondendo(null);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function Responder({ orcamento, onFechar, onFeito }: { orcamento: Orcamento; onFechar: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState(orcamento.valor ? String(orcamento.valor).replace(".", ",") : "");
  const [tempo, setTempo] = useState(orcamento.duracao_min ? String(orcamento.duracao_min) : String(orcamento.expand?.servico?.duracao_media_min || ""));
  const [resposta, setResposta] = useState(orcamento.resposta || "");
  const [validade, setValidade] = useState("7");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    setErro("");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!v || v <= 0) return setErro("Informe o valor.");
    setEnviando(true);
    try {
      await pb.send(`/api/lr/orcamentos/${orcamento.id}/responder`, {
        method: "POST",
        body: { valor: v, duracao_min: parseInt(tempo, 10) || 0, resposta: resposta.trim(), validade_dias: parseInt(validade, 10) || 7 },
      });
      onFeito();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Folha titulo={`Orçamento · ${orcamento.expand?.cliente?.nome || ""}`} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-fundo px-3 py-2 text-base text-tinta">“{orcamento.descricao}”</p>
        <div className="grid grid-cols-3 gap-2">
          <Campo rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} />
          <Campo rotulo="Tempo (min)" type="number" inputMode="numeric" min={0} max={1440} value={tempo} onChange={(e) => setTempo(e.target.value)} />
          <Campo rotulo="Vale (dias)" type="number" inputMode="numeric" min={1} max={60} value={validade} onChange={(e) => setValidade(e.target.value)} />
        </div>
        <Campo rotulo="O que inclui (opcional)" maxLength={600} placeholder="Ex.: polimento técnico em 3 etapas, sem riscos profundos" value={resposta} onChange={(e) => setResposta(e.target.value)} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando} onClick={enviar}>
          Enviar orçamento ao cliente
        </Botao>
        <p className="text-sm text-tinta-suave">O cliente recebe o aviso, aceita ou recusa. Aceitando, ele pede o horário e a fila usa este valor.</p>
      </div>
    </Folha>
  );
}
