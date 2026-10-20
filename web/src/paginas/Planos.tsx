import { Gift } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { descricaoVeiculo, useMeusVeiculos } from "../componentes/MeusVeiculos";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, Confirmar, EstadoVazio, Folha, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { dia, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import type { Assinatura, Fidelidade, Plano, Servico } from "../lib/tipos";

// Planos (pacotes) e cartão fidelidade. O cliente vê e pede; só o dono cria, muda e ativa.
// Tudo é pago no balcão: o dono ativa o pedido depois de receber (o valor entra no caixa).

export function Planos() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario } = useSessao();
  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;
  if (vinculo?.papel === "patrao") return <PlanosDono />;
  if (vinculo?.papel === "cliente") return <PlanosCliente />;
  return <Navigate to={`/${empresa.slug}`} replace />;
}

function useServicos() {
  const { empresa } = useEmpresa();
  const [lista, setLista] = useState<Servico[]>([]);
  useEffect(() => {
    pb.collection("servicos")
      .getFullList<Servico>({ filter: pb.filter("empresa = {:e}", { e: empresa.id }), sort: "ordem_exibicao,nome" })
      .then(setLista)
      .catch(() => {});
  }, [empresa.id]);
  return lista;
}

function textoPlano(p: Plano, servicos: Servico[]) {
  const nomes = p.servicos?.length ? servicos.filter((s) => p.servicos.includes(s.id)).map((s) => s.nome) : [];
  return `${p.lavagens} ${p.lavagens === 1 ? "lavagem" : "lavagens"} em ${p.validade_dias} dias${nomes.length ? ` · ${nomes.join(", ")}` : " · qualquer serviço"}`;
}

const NOME_STATUS: Record<string, string> = {
  pedido: "Esperando o lava rápido",
  ativa: "Ativo",
  recusada: "Recusado",
  cancelada: "Cancelado",
  vencida: "Vencido",
  usada: "Lavagens usadas",
};

// ---------------------------------------------------------------- cliente
interface MeusPlanos {
  planos: { id: string; plano: string; carro: string; status: string; motivo: string; restantes: number; total: number; fim: string }[];
  fidelidade: Fidelidade | null;
}

function PlanosCliente() {
  const { empresa } = useEmpresa();
  const servicos = useServicos();
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [meus, setMeus] = useState<MeusPlanos | null>(null);
  const [pedindo, setPedindo] = useState<Plano | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [l, m] = await Promise.all([
        pb.collection("planos").getFullList<Plano>({ filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), sort: "ordem,preco" }),
        pb.send<MeusPlanos>(`/api/lr/meus-planos/${empresa.slug}`, { method: "GET" }),
      ]);
      setPlanos(l);
      setMeus(m);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, empresa.slug]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const f = meus?.fidelidade;
  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Planos e fidelidade">
      {erro && <Aviso>{erro}</Aviso>}
      {f && (
        <section className="mb-5 rounded-3xl bg-marca p-5 text-sobre-marca shadow-lg" aria-labelledby="titulo-fid">
          <p id="titulo-fid" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide opacity-90">
            <Gift className="h-5 w-5" aria-hidden="true" /> Cartão fidelidade
          </p>
          <p className="mt-1 text-xl font-black leading-tight">A cada {f.meta} lavagens: {f.premio || "um prêmio"}</p>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${f.meta - f.faltam} de ${f.meta} lavagens`}>
            {Array.from({ length: f.meta }).map((_, i) => (
              <span key={i} className={`h-7 w-7 rounded-full border-2 border-white ${i < f.meta - f.faltam ? "bg-white" : "bg-transparent"}`} />
            ))}
          </div>
          <p className="mt-3 text-base">
            {f.disponiveis > 0 ? (
              <strong>Você tem {f.disponiveis} prêmio(s) para usar! Avise a equipe na próxima lavagem.</strong>
            ) : (
              `Faltam ${f.faltam} ${f.faltam === 1 ? "lavagem" : "lavagens"} para ganhar.`
            )}
          </p>
        </section>
      )}

      {meus && meus.planos.length > 0 && (
        <section className="mb-5" aria-labelledby="titulo-meus">
          <h2 id="titulo-meus" className="mb-2 text-lg font-extrabold text-tinta">
            Meus planos
          </h2>
          <ul className="flex flex-col gap-2">
            {meus.planos.map((m) => (
              <li key={m.id} className="rounded-2xl border border-linha bg-white p-4">
                <p className="text-base font-extrabold text-tinta">{m.plano}</p>
                <p className="text-sm text-tinta-suave">{m.carro}</p>
                <p className="mt-1 text-base text-tinta">
                  <strong>{NOME_STATUS[m.status] || m.status}</strong>
                  {m.status === "ativa" && ` · ${m.restantes} de ${m.total} lavagens · até ${dia(m.fim)}`}
                  {m.status === "pedido" && " · pague no balcão para ativar"}
                  {m.motivo && ` · ${m.motivo}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2 text-lg font-extrabold text-tinta">Planos do {empresa.nome}</h2>
      {planos === null ? (
        <Carregando />
      ) : planos.length === 0 ? (
        <EstadoVazio titulo="Nenhum plano por enquanto" texto="Quando o lava rápido criar planos, eles aparecem aqui." />
      ) : (
        <ul className="flex flex-col gap-3">
          {planos.map((p) => (
            <li key={p.id} className="rounded-2xl border-2 border-linha bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-lg font-extrabold text-tinta">{p.nome}</p>
                <p className="shrink-0 text-xl font-black text-tinta">{reais(p.preco)}</p>
              </div>
              <p className="text-sm font-semibold text-tinta-suave">{textoPlano(p, servicos)}</p>
              {p.descricao && <p className="mt-1 text-base text-tinta">{p.descricao}</p>}
              <Botao largo className="mt-3" onClick={() => setPedindo(p)}>
                Quero este plano
              </Botao>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-tinta-suave">O pagamento é no balcão. O plano começa quando o lava rápido confirmar o recebimento. Cada plano vale para um carro.</p>
      {pedindo && (
        <PedirPlano
          plano={pedindo}
          onFechar={() => setPedindo(null)}
          onPedido={() => {
            setPedindo(null);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function PedirPlano({ plano, onFechar, onPedido }: { plano: Plano; onFechar: () => void; onPedido: () => void }) {
  const { veiculos } = useMeusVeiculos();
  const [veiculo, setVeiculo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const escolhido = veiculo || (veiculos?.length === 1 ? veiculos[0].id : "");
  async function pedir() {
    if (!escolhido) return setErro("Escolha o carro do plano.");
    setEnviando(true);
    setErro("");
    try {
      await pb.send("/api/lr/planos/pedir", { method: "POST", body: { plano: plano.id, veiculo: escolhido } });
      onPedido();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Folha titulo={plano.nome} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <p className="text-base text-tinta">
          <strong>{reais(plano.preco)}</strong>, pago no balcão. O lava rápido ativa depois de receber.
        </p>
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Para qual carro?</legend>
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
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando} onClick={pedir}>
          Pedir este plano
        </Botao>
      </div>
    </Folha>
  );
}

// ------------------------------------------------------------------- dono
function PlanosDono() {
  const { empresa } = useEmpresa();
  const servicos = useServicos();
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [editando, setEditando] = useState<Plano | "novo" | null>(null);
  const [decidindo, setDecidindo] = useState<Assinatura | null>(null);
  const [cancelando, setCancelando] = useState<Assinatura | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [l, a] = await Promise.all([
        pb.collection("planos").getFullList<Plano>({ filter: pb.filter("empresa = {:e}", { e: empresa.id }), sort: "-ativo,ordem,preco" }),
        pb.collection("assinaturas").getFullList<Assinatura>({
          filter: pb.filter("empresa = {:e} && (status = 'pedido' || status = 'ativa')", { e: empresa.id }),
          sort: "-created",
          expand: "cliente,veiculo",
        }),
      ]);
      setPlanos(l);
      setAssinaturas(a);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const pedidos = assinaturas.filter((a) => a.status === "pedido");
  const ativas = assinaturas.filter((a) => a.status === "ativa" && new Date(a.fim.replace(" ", "T")).getTime() > Date.now());
  const carro = (a: Assinatura) => (a.expand?.veiculo ? descricaoVeiculo(a.expand.veiculo) : "");

  async function cancelar() {
    if (!cancelando) return;
    setOcupado(true);
    try {
      await pb.send(`/api/lr/planos/${cancelando.id}/cancelar`, { method: "POST", body: { motivo: "Cancelado pelo dono" } });
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
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Planos e fidelidade">
      {erro && <Aviso>{erro}</Aviso>}
      {pedidos.length > 0 && (
        <section className="mb-5 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4" aria-labelledby="titulo-pedidos">
          <h2 id="titulo-pedidos" className="text-lg font-extrabold text-tinta">
            Pedidos para ativar ({pedidos.length})
          </h2>
          <p className="text-sm text-tinta">Ative só depois de receber no balcão. O valor entra no caixa como “Planos”.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {pedidos.map((a) => (
              <li key={a.id} className="rounded-2xl bg-white p-3">
                <p className="text-base font-bold text-tinta">
                  {a.expand?.cliente?.nome} · {a.plano_nome}
                </p>
                <p className="text-sm text-tinta-suave">{carro(a)}</p>
                <Botao largo className="mt-2" onClick={() => setDecidindo(a)}>
                  Ativar ou recusar
                </Botao>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfigFidelidade />

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-tinta">Planos</h2>
        <Botao variante="secundario" onClick={() => setEditando("novo")}>
          + Novo plano
        </Botao>
      </div>
      {planos === null ? (
        <Carregando />
      ) : planos.length === 0 ? (
        <EstadoVazio titulo="Nenhum plano ainda" texto="Ex.: “Mensal 4 lavagens simples”, “Quinzenal SUV”. Você escolhe preço, validade, lavagens e serviços." />
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {planos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setEditando(p)}
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 text-left hover:border-marca ${p.ativo ? "" : "opacity-60"}`}
              >
                <span className="min-w-0">
                  <span className="block text-base font-extrabold text-tinta">
                    {p.nome}
                    {!p.ativo && " (pausado)"}
                  </span>
                  <span className="block text-sm text-tinta-suave">{textoPlano(p, servicos)}</span>
                </span>
                <span className="shrink-0 text-lg font-black text-tinta">{reais(p.preco)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-lg font-extrabold text-tinta">Planos ativos ({ativas.length})</h2>
      {ativas.length === 0 ? (
        <p className="mt-1 text-base text-tinta-suave">Nenhum cliente com plano ativo.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {ativas.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3">
              <span className="min-w-0">
                <span className="block text-base font-bold text-tinta">
                  {a.expand?.cliente?.nome} · {a.plano_nome}
                </span>
                <span className="block text-sm text-tinta-suave">
                  {carro(a)} · {a.lavagens_total - a.lavagens_usadas} de {a.lavagens_total} · até {dia(a.fim)}
                </span>
              </span>
              <button type="button" onClick={() => setCancelando(a)} className="min-h-12 shrink-0 rounded-xl px-3 text-sm font-bold text-red-700 hover:bg-red-50">
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <EditarPlano
          plano={editando === "novo" ? null : editando}
          servicos={servicos}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
      {decidindo && (
        <DecidirPedido
          pedido={decidindo}
          preco={planos?.find((p) => p.id === decidindo.plano)?.preco || 0}
          onFechar={() => setDecidindo(null)}
          onFeito={() => {
            setDecidindo(null);
            carregar();
          }}
        />
      )}
      <Confirmar
        aberto={!!cancelando}
        titulo="Cancelar este plano?"
        texto="As lavagens que sobraram deixam de valer. O caixa não muda sozinho: se devolver dinheiro, lance no Caixa."
        rotuloConfirmar="Cancelar plano"
        perigo
        carregando={ocupado}
        onConfirmar={cancelar}
        onCancelar={() => setCancelando(null)}
      />
    </Moldura>
  );
}

function ConfigFidelidade() {
  const { empresa, recarregarEmpresa } = useEmpresa();
  const [ativa, setAtiva] = useState(!!empresa.fidelidade_ativa);
  const [meta, setMeta] = useState(String(empresa.fidelidade_meta || 10));
  const [premio, setPremio] = useState(empresa.fidelidade_premio || "");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErro("");
    const n = parseInt(meta, 10);
    if (ativa && (!n || n < 2 || n > 50)) return setErro("Número de lavagens entre 2 e 50.");
    if (ativa && premio.trim().length < 3) return setErro("Diga qual é o prêmio (ex.: 1 lavagem simples grátis).");
    setSalvando(true);
    try {
      await pb.collection("empresas").update(empresa.id, { fidelidade_ativa: ativa, fidelidade_meta: n || 0, fidelidade_premio: premio.trim() });
      await recarregarEmpresa();
      setMsg("Cartão fidelidade salvo.");
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }
  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-2xl border border-linha bg-white p-4" noValidate>
      <h2 className="text-lg font-extrabold text-tinta">Cartão fidelidade</h2>
      <Interruptor
        rotulo="Ligar o cartão fidelidade"
        descricao="A cada tantas lavagens (fora as pagas por plano), o cliente ganha um prêmio. A equipe usa o prêmio na fila."
        ligado={ativa}
        onChange={setAtiva}
      />
      {ativa && (
        <>
          <Campo rotulo="A cada quantas lavagens" type="number" inputMode="numeric" min={2} max={50} value={meta} onChange={(e) => setMeta(e.target.value)} />
          <Campo rotulo="Prêmio" placeholder="Ex.: 1 lavagem simples grátis" maxLength={120} value={premio} onChange={(e) => setPremio(e.target.value)} />
        </>
      )}
      {msg && <Aviso tipo="sucesso">{msg}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" variante="secundario" largo carregando={salvando}>
        Salvar cartão fidelidade
      </Botao>
    </form>
  );
}

function EditarPlano({ plano, servicos, onFechar, onSalvo }: { plano: Plano | null; servicos: Servico[]; onFechar: () => void; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const [nome, setNome] = useState(plano?.nome || "");
  const [descricao, setDescricao] = useState(plano?.descricao || "");
  const [preco, setPreco] = useState(plano ? String(plano.preco).replace(".", ",") : "");
  const [validade, setValidade] = useState(String(plano?.validade_dias || 30));
  const [lavagens, setLavagens] = useState(String(plano?.lavagens || 4));
  const [incluidos, setIncluidos] = useState<string[]>(plano?.servicos || []);
  const [ativo, setAtivo] = useState(plano ? plano.ativo : true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const v = Number(preco.replace(/\./g, "").replace(",", "."));
    const d = parseInt(validade, 10);
    const l = parseInt(lavagens, 10);
    if (nome.trim().length < 2) return setErro("Dê um nome ao plano.");
    if (!v || v <= 0) return setErro("Informe o preço.");
    if (!d || d < 1 || d > 366) return setErro("Validade entre 1 e 366 dias.");
    if (!l || l < 1 || l > 100) return setErro("Lavagens entre 1 e 100.");
    const dados = { nome: nome.trim(), descricao: descricao.trim(), preco: Math.round(v * 100) / 100, validade_dias: d, lavagens: l, servicos: incluidos, ativo };
    setSalvando(true);
    try {
      if (plano) await pb.collection("planos").update(plano.id, dados);
      else await pb.collection("planos").create({ ...dados, empresa: empresa.id, ordem: 0 });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Folha titulo={plano ? "Editar plano" : "Novo plano"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="Nome" placeholder="Mensal 4 lavagens" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Descrição (opcional)" placeholder="O que inclui, para quem é" maxLength={500} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <Campo rotulo="Preço (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ""))} />
          <Campo rotulo="Lavagens" type="number" inputMode="numeric" min={1} max={100} value={lavagens} onChange={(e) => setLavagens(e.target.value)} />
          <Campo rotulo="Validade (dias)" type="number" inputMode="numeric" min={1} max={366} value={validade} onChange={(e) => setValidade(e.target.value)} />
        </div>
        <fieldset>
          <legend className="mb-1 text-base font-bold text-tinta">Serviços incluídos</legend>
          <p className="mb-2 text-sm text-tinta-suave">Nenhum marcado = vale para qualquer serviço.</p>
          <div className="flex flex-wrap gap-2">
            {servicos.map((s) => {
              const marcado = incluidos.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  onClick={() => setIncluidos((l) => (marcado ? l.filter((x) => x !== s.id) : [...l, s.id]))}
                  className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold ${marcado ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
                >
                  {s.nome}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Interruptor rotulo="Mostrar para os clientes" descricao="Desligado = pausado. Quem já tem o plano continua usando." ligado={ativo} onChange={setAtivo} />
        {plano && <p className="text-sm text-tinta-suave">Mudar o plano vale para os próximos pedidos. Quem já tem o plano fica como foi ativado.</p>}
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar plano
        </Botao>
      </form>
    </Folha>
  );
}

function DecidirPedido({ pedido, preco, onFechar, onFeito }: { pedido: Assinatura; preco: number; onFechar: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState(preco ? String(preco).replace(".", ",") : "");
  const [forma, setForma] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function decidir(aprovar: boolean) {
    setErro("");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    if (aprovar && (!v || v <= 0)) return setErro("Informe o valor recebido.");
    if (aprovar && !forma) return setErro("Escolha como o cliente pagou.");
    setEnviando(true);
    try {
      await pb.send(`/api/lr/planos/${pedido.id}/decidir`, { method: "POST", body: { aprovar, valor: v, forma, motivo: motivo.trim() } });
      onFeito();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Folha titulo={`${pedido.plano_nome} · ${pedido.expand?.cliente?.nome || ""}`} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <p className="text-base text-tinta">{pedido.expand?.veiculo ? descricaoVeiculo(pedido.expand.veiculo) : ""}</p>
        <Campo rotulo="Valor recebido (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} />
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Como pagou</legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["cartao", "Cartão"],
              ["pix", "Pix"],
              ["dinheiro", "Dinheiro"],
            ].map(([id, nome]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={forma === id}
                onClick={() => setForma(id)}
                className={`min-h-12 rounded-xl border-2 font-bold ${forma === id ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
              >
                {nome}
              </button>
            ))}
          </div>
        </fieldset>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando} onClick={() => decidir(true)}>
          Recebi: ativar o plano
        </Botao>
        <Campo rotulo="Motivo (se for recusar)" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Botao variante="secundario" largo disabled={enviando} onClick={() => decidir(false)}>
          Recusar pedido
        </Botao>
      </div>
    </Folha>
  );
}
