import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AtivarAvisos } from "../componentes/Avisos";
import { Quantidade } from "../componentes/Quantidade";
import { precoPara, tiposDaEmpresa } from "../componentes/TipoVeiculo";
import { textoPorte, tipoDoCarro } from "../lib/porteVeiculo";
import { FotosEntrada, useFotosDasEntradas } from "../componentes/Vistoria";
import { ListaFilaPublica, IconeBusca } from "../componentes/fila";
import { descricaoVeiculo, detalheVeiculo, NovoVeiculo, useMeusVeiculos } from "../componentes/MeusVeiculos";
import { Aviso, Botao, Carregando, Cartao, Confirmar, EstadoErro, Folha, Interruptor } from "../componentes/ui";
import { guardarCarrinho, itensDoCarrinho, lerCarrinho, useCatalogo, Vitrine, type Carrinho } from "../componentes/Vitrine";
import { useEmpresa } from "../contexto/Empresa";
import { acaoFila, emQuanto, hora, useFilaAoVivo, type ItemPublico } from "../lib/fila";
import { duracao, linkWhatsApp, reais } from "../lib/formato";
import { mensagemDeErro, pb, urlArquivo } from "../lib/pb";
import type { ItemPedido, ProdutoCatalogo, Servico, StatusFila } from "../lib/tipos";

// Enquanto o carro está na fila (ou lavando), o cliente ainda pode reservar produtos.
const PODE_RESERVAR: StatusFila[] = ["pendente", "confirmado", "avisado", "no_local", "lavando"];

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
  const [cancelando, setCancelando] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState("");
  const [itens, setItens] = useState<Record<string, ItemPedido[]>>({});
  const [avaliar, setAvaliar] = useState("");
  const [versaoItens, setVersaoItens] = useState(0);
  const [vendoFotos, setVendoFotos] = useState("");
  const catalogo = useCatalogo(empresa.slug);
  const [carrinho, setCarrinhoEstado] = useState<Carrinho>(() => lerCarrinho(empresa.slug));
  const setCarrinho = (c: Carrinho) => {
    setCarrinhoEstado(c);
    guardarCarrinho(empresa.slug, c);
  };

  // Última lavagem ainda sem avaliação (até 3 dias).
  useEffect(() => {
    pb.send<{ entrada: string }>(`/api/lr/avaliacao-pendente/${encodeURIComponent(empresa.slug)}`, { method: "GET" })
      .then((r) => setAvaliar(r.entrada))
      .catch(() => {});
  }, [empresa.slug]);
  // O cliente pode ter mais de um carro na fila: cada carro tem o seu cartão e o seu valor.
  const chaveMinhas = publica ? [...publica.lavando, ...publica.fila, ...publica.prontos].filter((i) => i.minha).map((i) => i.id).join(",") : "";
  const { contagem: fotos } = useFotosDasEntradas(chaveMinhas ? chaveMinhas.split(",") : []);

  // Produtos que o cliente pediu (e se a equipe já separou), por carro.
  useEffect(() => {
    if (!chaveMinhas) return;
    const ids = chaveMinhas.split(",");
    pb.collection("itens_pedido")
      .getFullList<ItemPedido>({ filter: ids.map((id) => pb.filter("entrada = {:e}", { e: id })).join(" || ") })
      .then((l) => setItens(Object.fromEntries(ids.map((id) => [id, l.filter((i) => i.entrada === id)]))))
      .catch(() => {});
  }, [chaveMinhas, publica, versaoItens]);

  if (erro && !publica) return <EstadoErro texto={erro} tentar={recarregar} />;
  if (!publica) return <Carregando texto="Carregando a fila…" />;

  const minhas: ItemPublico[] = [...publica.lavando, ...publica.fila, ...publica.prontos].filter((i) => i.minha);
  const minha = minhas[0];
  // Produtos reservados durante a fila vão junto com o primeiro carro que ainda aceita reserva.
  const alvoProdutos = minhas.find((m) => PODE_RESERVAR.includes(m.status));
  const podeReservar = !!alvoProdutos;

  async function removerItem(id: string) {
    setErroAcao("");
    try {
      await pb.send(`/api/lr/itens/${id}/remover`, { method: "POST" });
      setVersaoItens((v) => v + 1);
    } catch (err) {
      setErroAcao(mensagemDeErro(err));
    }
  }

  async function cancelar() {
    if (!cancelando) return;
    setOcupado(true);
    setErroAcao("");
    try {
      await acaoFila(cancelando, "cancelar");
      setCancelando("");
      recarregar();
    } catch (err) {
      setErroAcao(mensagemDeErro(err));
      setCancelando("");
    } finally {
      setOcupado(false);
    }
  }

  function cartaoMinhaVez(minha: ItemPublico) {
    const info = MENSAGEM_STATUS[minha.status];
    const meusItens = itens[minha.id] ?? null;
    const podeReservarEste = PODE_RESERVAR.includes(minha.status);
    if (!info || !publica) return null;
    const produtosOk = (meusItens || []).filter((i) => i.status !== "em_falta");
    return (
      <div key={minha.id}>
        <div className="rounded-3xl bg-marca p-5 text-sobre-marca shadow-lg">
              <p className="text-sm font-bold uppercase tracking-wide opacity-85">
                Sua vez{minhas.length > 1 ? ` · ${[minha.modelo, `…${minha.final_placa}`].filter(Boolean).join(" ")}` : ""}
              </p>
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
              {!!minha.atrasado_min && (
                <div className="mt-3 rounded-xl bg-white/95 p-3 text-base text-tinta">
                  Passou do horário combinado. Você não perde a vez se avisar o lava rápido quando vai chegar.
                  {empresa.whatsapp && (
                    <a
                      href={linkWhatsApp(empresa.whatsapp, `Olá! Sou ${minha.nome} (…${minha.final_placa}) e estou a caminho. Chego em uns minutos.`)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-4 font-bold text-white"
                    >
                      Avisar no WhatsApp
                    </a>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-black/15 px-3 py-1 text-sm font-bold">{minha.servico}</span>
                {minha.quer_busca && <IconeBusca />}
              </div>
              {minha.valor !== undefined && (
                <div className="mt-3 rounded-xl bg-white/95 p-3 text-tinta">
                  <p className="text-sm font-bold uppercase tracking-wide text-tinta-suave">Valor deste carro (paga no fim)</p>
                  <p className="mt-1 flex items-baseline justify-between gap-3 text-base">
                    <span>
                      {minha.servico}
                      {minha.tipo_nome ? ` · ${minha.tipo_nome}` : ""}
                    </span>
                    <strong className="shrink-0">{reais(minha.valor)}</strong>
                  </p>
                  {produtosOk.map((i) => (
                    <p key={i.id} className="flex items-baseline justify-between gap-3 text-base">
                      <span>
                        {i.quantidade}× {i.produto_nome || i.expand?.produto?.nome || "Produto"}
                      </span>
                      <strong className="shrink-0">{reais(i.preco_unitario * i.quantidade)}</strong>
                    </p>
                  ))}
                </div>
              )}
              {meusItens && meusItens.length > 0 && (
                <p className="mt-3 text-sm font-semibold opacity-90">Seus produtos (paga e retira no fim, junto com a lavagem):</p>
              )}
              {meusItens && meusItens.length > 0 && (
                <ul className="mt-1 rounded-xl bg-black/10 px-3 py-2 text-base">
                  {meusItens.map((i) => (
                    <li key={i.id} className="flex min-h-10 items-center justify-between gap-2">
                      <span>
                        {i.quantidade}× {i.produto_nome || i.expand?.produto?.nome || "Produto"}
                      </span>
                      {i.status === "pendente" && podeReservarEste ? (
                        <button
                          type="button"
                          onClick={() => removerItem(i.id)}
                          aria-label={`Tirar ${i.produto_nome}`}
                          className="min-h-10 rounded-lg px-2 text-sm font-bold underline opacity-90 hover:bg-black/10"
                        >
                          tirar
                        </button>
                      ) : (
                        <span className="text-sm font-bold opacity-90">
                          {i.status === "separado" ? "separado ✓" : i.status === "em_falta" ? "em falta" : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {alvoProdutos?.id === minha.id && catalogo && catalogo.length > 0 && (
                <button
                  type="button"
                  onClick={() => document.getElementById("titulo-produtos")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="mt-3 min-h-12 w-full rounded-xl bg-white/95 px-4 text-base font-bold text-marca-forte"
                >
                  + Pôr mais produtos
                </button>
              )}
              {!!fotos[minha.id] && (
                <button
                  type="button"
                  onClick={() => setVendoFotos(minha.id)}
                  className="mt-3 min-h-12 w-full rounded-xl bg-white/95 px-4 text-base font-bold text-marca-forte"
                >
                  Ver fotos do seu carro ({fotos[minha.id]})
                </button>
              )}
              {empresa.whatsapp && (
                <a
                  href={linkWhatsApp(empresa.whatsapp, `Olá! Sou ${minha.nome} (placa final ${minha.final_placa}) e estou na fila pelo app.`)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-4 text-base font-bold text-white"
                >
                  Falar com o {empresa.nome} no WhatsApp
                </a>
              )}
              {minha.posicao !== undefined && (
                <button
                  onClick={() => setCancelando(minha.id)}
                  className="mt-4 min-h-12 w-full rounded-xl border-2 border-current/40 px-4 text-base font-bold hover:bg-black/10"
                >
                  Cancelar minha vez
                </button>
              )}
            </div>
          </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {minhas.length > 0 ? (
        <>
          {minhas.map((m) => cartaoMinhaVez(m))}
          {minhas.length > 1 && (
            <p className="rounded-xl bg-fundo px-4 py-3 text-sm text-tinta">
              Cada carro tem o seu valor e paga separado. O app não soma os carros.
            </p>
          )}
          {minhas.length < 3 && minhas.every((m) => m.status !== "pronto") && (
            <Botao variante="secundario" largo onClick={() => setEntrando(true)}>
              + Colocar outro carro na fila
            </Botao>
          )}
        </>
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
      {catalogo && (!minha || podeReservar) && (
        <Vitrine
          catalogo={catalogo}
          carrinho={carrinho}
          onCarrinho={setCarrinho}
          entradaId={alvoProdutos?.id}
          onReservado={() => setVersaoItens((v) => v + 1)}
        />
      )}
      {avaliar && !minha && (
        <Link
          to={`/${empresa.slug}/avaliar/${avaliar}`}
          className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3"
        >
          <span>
            <span className="block text-lg font-extrabold text-tinta">Como foi sua lavagem?</span>
            <span className="block text-base text-tinta-suave">Avalie em 10 segundos ★★★★★</span>
          </span>
          <span className="text-2xl text-tinta" aria-hidden="true">›</span>
        </Link>
      )}
      <AtivarAvisos />

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
          catalogo={catalogo || []}
          naFila={minhas.map((m) => m.veiculo || "").filter(Boolean)}
          carrinho={carrinho}
          onCarrinho={setCarrinho}
          onFechar={() => setEntrando(false)}
          onEntrou={() => {
            setCarrinho({});
            setEntrando(false);
            recarregar();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
      {vendoFotos && (
        <FotosEntrada
          entradaId={vendoFotos}
          empresaId={empresa.id}
          titulo="Fotos do seu carro"
          podeTirar={false}
          momentoPadrao="antes"
          onFechar={() => setVendoFotos("")}
        />
      )}
      <Confirmar
        aberto={!!cancelando}
        titulo="Cancelar sua vez?"
        texto="Você sai da fila. Se quiser voltar depois, entra de novo no fim."
        rotuloConfirmar="Sim, cancelar"
        perigo
        carregando={ocupado}
        onConfirmar={cancelar}
        onCancelar={() => setCancelando("")}
      />
    </div>
  );
}

function EntrarNaFila({
  catalogo,
  carrinho,
  onCarrinho,
  naFila,
  onFechar,
  onEntrou,
}: {
  catalogo: ProdutoCatalogo[];
  carrinho: Carrinho;
  onCarrinho: (c: Carrinho) => void;
  /** Carros deste cliente que já estão na fila (não entram de novo). */
  naFila: string[];
  onFechar: () => void;
  onEntrou: () => void;
}) {
  const { empresa, vinculo } = useEmpresa();
  const { veiculos, recarregar } = useMeusVeiculos();
  const [servicos, setServicos] = useState<Servico[] | null>(null);
  const [servico, setServico] = useState("");
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const [busca, setBusca] = useState(false);
  const [obs, setObs] = useState("");
  const [novoVeiculo, setNovoVeiculo] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    pb.collection("servicos")
      .getFullList<Servico>({ filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), sort: "ordem_exibicao,nome" })
      .then((l) => setServicos(l.filter((x) => !x.sob_orcamento)))
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [empresa.id]);

  const itensCarrinho = itensDoCarrinho(carrinho);
  const livres = (veiculos || []).filter((v) => !naFila.includes(v.id));
  // Sem escolha ainda: com um carro só, ele já vem marcado.
  const escolhidos = marcados ?? (livres.length === 1 ? [livres[0].id] : []);
  const maxNovos = Math.max(0, 3 - naFila.length);
  const tipos = tiposDaEmpresa(empresa);
  const usaPorte = tipos.some((t) => t.vale && t.vale !== "app");
  // Cada carro tem o seu preço (tamanho pelo modelo, ou o que o lava rápido definiu). Nunca somamos.
  const carros = escolhidos
    .map((id) => veiculos?.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => !!v)
    .map((v) => ({ v, ...tipoDoCarro(tipos, vinculo, v) }));
  const servicoEscolhido = servicos?.find((s) => s.id === servico);

  function alternarCarro(id: string) {
    setErro("");
    const atual = escolhidos;
    if (atual.includes(id)) return setMarcados(atual.filter((x) => x !== id));
    if (atual.length >= maxNovos) return setErro(`No máximo 3 carros na fila ao mesmo tempo.`);
    setMarcados([...atual, id]);
  }

  function conferir() {
    setErro("");
    if (!escolhidos.length) return setErro("Escolha o veículo.");
    if (!servico) return setErro("Escolha o serviço.");
    setConferindo(true);
  }

  async function confirmar() {
    setErro("");
    setEnviando(true);
    try {
      await pb.send("/api/lr/fila/entrar", {
        method: "POST",
        body: { slug: empresa.slug, servico, veiculos: escolhidos, quer_busca: !!empresa.oferece_busca && busca, observacao: obs.trim(), itens: itensCarrinho },
      });
      onEntrou();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setConferindo(false);
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
          setMarcados([...escolhidos, v.id].slice(0, maxNovos));
          recarregar();
        }}
      />
    );
  }

  const nomeCarro = (v: (typeof carros)[number]["v"]) => [v.modelo, v.placa || `…${v.final_placa}`].filter(Boolean).join(" · ");

  if (conferindo && servicoEscolhido) {
    return (
      <Folha titulo="Confira antes de entrar" onFechar={onFechar}>
        <div className="flex flex-col gap-4">
          <p className="text-base text-tinta">
            Confira cada carro. <strong>Cada carro tem o seu valor e paga separado</strong>, no fim, quando ficar pronto.
          </p>
          {carros.map(({ v, tipo, appPendente }) => (
            <div key={v.id} className="rounded-2xl border-2 border-linha bg-white p-4">
              <p className="text-lg font-extrabold text-tinta">{nomeCarro(v)}</p>
              <p className="text-sm text-tinta-suave">{tipo ? tipo.nome : v.porte ? textoPorte(v.porte) : usaPorte ? "Tamanho: o lava rápido confere" : ""}</p>
              <p className="mt-2 flex items-baseline justify-between gap-3 text-base text-tinta">
                <span>{servicoEscolhido.nome}</span>
                <strong className="text-xl">{reais(precoPara(servicoEscolhido, tipo?.id))}</strong>
              </p>
              {appPendente && <p className="mt-2 text-sm text-tinta">Motorista de app: 1ª lavagem pelo preço normal; o lava rápido confere na hora.</p>}
            </div>
          ))}
          {itensCarrinho.length > 0 && (
            <div className="rounded-2xl border-2 border-linha bg-white p-4">
              <p className="text-base font-extrabold text-tinta">Produtos{carros.length > 1 ? ` (vão junto com o ${nomeCarro(carros[0].v)})` : ""}</p>
              {itensCarrinho.map((it) => {
                const p = catalogo.find((x) => x.id === it.produto);
                return (
                  <p key={it.produto} className="mt-1 flex items-baseline justify-between gap-3 text-base text-tinta">
                    <span>
                      {it.quantidade}× {p?.nome}
                    </span>
                    <strong>{reais((p?.preco || 0) * it.quantidade)}</strong>
                  </p>
                );
              })}
            </div>
          )}
          {empresa.oferece_busca && busca && <p className="text-base text-tinta">Busca do carro: <strong>taxa adicional</strong>, combinada no WhatsApp.</p>}
          {obs.trim() && <p className="rounded-xl bg-fundo px-4 py-3 text-base text-tinta">“{obs.trim()}”</p>}
          {erro && <Aviso>{erro}</Aviso>}
          <Botao largo carregando={enviando} onClick={confirmar}>
            {carros.length > 1 ? `Confirmar e colocar os ${carros.length} carros na fila` : "Confirmar e entrar na fila"}
          </Botao>
          <Botao variante="secundario" largo disabled={enviando} onClick={() => setConferindo(false)}>
            Voltar e mudar
          </Botao>
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo="Entrar na fila" onFechar={onFechar}>
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-1 text-base font-bold text-tinta">Veículo</legend>
          <p className="mb-2 text-sm text-tinta-suave">Vai trazer mais de um? Marque os carros (até 3). Cada um entra com a sua vez e o seu valor.</p>
          <div className="flex flex-col gap-2">
            {veiculos?.map((v) => {
              const jaEsta = naFila.includes(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  role="checkbox"
                  aria-checked={escolhidos.includes(v.id)}
                  disabled={jaEsta}
                  onClick={() => alternarCarro(v.id)}
                  className={`min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left disabled:opacity-50 ${escolhidos.includes(v.id) ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
                >
                  <span className="block text-base font-bold text-tinta">
                    {escolhidos.includes(v.id) ? "✓ " : ""}
                    {descricaoVeiculo(v)}
                  </span>
                  <span className="block text-sm text-tinta-suave">{jaEsta ? "Já está na fila" : usaPorte ? detalheVeiculo(v) : ""}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setNovoVeiculo(true)} className="min-h-12 self-start rounded-xl px-2 text-base font-bold text-marca-forte">
              + Outro veículo
            </button>
          </div>
        </fieldset>

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
                    {carros.length <= 1 && <span className="text-base font-bold text-tinta">{reais(precoPara(s, carros[0]?.tipo?.id))}</span>}
                  </span>
                  {carros.length > 1 &&
                    carros.map(({ v, tipo }) => (
                      <span key={v.id} className="flex items-baseline justify-between gap-3 text-sm text-tinta">
                        <span>
                          {v.modelo || `…${v.final_placa}`}
                          {tipo ? ` · ${tipo.nome}` : ""}
                        </span>
                        <strong>{reais(precoPara(s, tipo?.id))}</strong>
                      </span>
                    ))}
                  <span className="block text-sm text-tinta-suave">
                    ~{duracao(s.duracao_media_min)}
                    {s.descricao ? ` · ${s.descricao}` : ""}
                  </span>
                </Opcao>
              ))}
            </div>
          )}
        </fieldset>

        {catalogo.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-linha px-4 py-3 text-base text-tinta-suave">
            <strong className="text-tinta">Produtos:</strong> este lava rápido ainda não colocou produtos à venda pelo app.
          </p>
        )}
        {catalogo.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-base font-bold text-tinta">Produtos (opcional)</legend>
            <p className="mb-2 text-sm text-tinta-suave">
              A equipe separa para o seu carro. Você paga e retira tudo no fim, junto com a lavagem. Dá para pôr mais depois, sem sair da fila.
            </p>
            <div className="flex flex-col gap-2">
              {catalogo.map((p) => (
                <div key={p.id} className={`flex min-h-16 items-center gap-3 rounded-2xl border border-linha bg-white px-3 py-2 ${p.disponivel ? "" : "opacity-60"}`}>
                  {p.foto ? (
                    <img src={urlArquivo(p, p.foto, "200x200")} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-xl bg-fundo" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-tinta">{p.nome}</span>
                    <span className="block text-sm text-tinta-suave">{p.disponivel ? reais(p.preco) : "Em falta no momento"}</span>
                  </span>
                  {p.disponivel && (
                    <Quantidade rotulo={p.nome} max={20} valor={carrinho[p.id] || 0} onChange={(v) => onCarrinho({ ...carrinho, [p.id]: v })} />
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {empresa.oferece_busca && (
          <Interruptor
            rotulo="Quero que busquem meu carro (taxa adicional)"
            descricao="A busca tem taxa adicional, cobrada à parte do serviço. O lava rápido chama você no WhatsApp para combinar o local e o valor."
            ligado={busca}
            onChange={setBusca}
          />
        )}

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

        <p className="text-sm text-tinta-suave">Você paga no lava rápido, quando o carro ficar pronto. Cada carro paga o seu valor.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo onClick={conferir}>
          Conferir antes de entrar
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
