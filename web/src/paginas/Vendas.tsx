import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Quantidade } from "../componentes/Quantidade";
import { Aviso, Botao, Campo, Carregando, Cartao, Confirmar, EstadoErro, EstadoVazio } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { hora, nomeDaEntrada, placaDaEntrada, type EntradaFila } from "../lib/fila";
import { primeiroNome, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { NOME_PAGAMENTO, type FormaPagamento, type ItemPedido, type Produto, type Venda, type VendaItem } from "../lib/tipos";

// Início do dia de hoje em São Paulo (UTC−3), no formato de data do PocketBase.
export function inicioDoDiaSP(diasAtras = 0) {
  const d = new Date(Date.now() - diasAtras * 86400000);
  const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
  return `${dia} 03:00:00.000Z`;
}

const NOME_STATUS_VENDA = { aberta: "Aberta", fechada: "Fechada", corrigida: "Corrigida", descartada: "Descartada" };

export function Vendas() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario } = useSessao();
  const [abertas, setAbertas] = useState<Venda[] | null>(null);
  const [hoje, setHoje] = useState<Venda[] | null>(null);
  const [erro, setErro] = useState("");
  const veTodas = pode(vinculo, "ver_valores");

  const carregar = useCallback(async () => {
    if (!usuario) return;
    try {
      const [a, h] = await Promise.all([
        pb.collection("vendas").getFullList<Venda>({
          filter: pb.filter('empresa = {:e} && funcionario = {:u} && status = "aberta"', { e: empresa.id, u: usuario.id }),
          sort: "-created",
          expand: "entrada",
        }),
        pb.collection("vendas").getFullList<Venda>({
          filter: pb.filter('empresa = {:e} && (status = "fechada" || status = "corrigida") && fechada_em >= {:d}', {
            e: empresa.id,
            d: inicioDoDiaSP(),
          }),
          sort: "-fechada_em",
          expand: "funcionario",
        }),
      ]);
      setAbertas(a);
      setHoje(h);
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, usuario]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!pode(vinculo, "ver_fila_completa")) return <Navigate to={`/${empresa.slug}`} replace />;

  const totalHoje = (hoje || []).reduce((s, v) => s + v.total, 0);

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Vendas">
      <Link
        to={`/${empresa.slug}/vendas/nova`}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-marca px-5 text-base font-bold text-sobre-marca"
      >
        + Nova venda
      </Link>
      {erro ? (
        <EstadoErro texto={erro} tentar={carregar} />
      ) : abertas === null || hoje === null ? (
        <Carregando />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {abertas.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">Minhas vendas abertas</h2>
              <div className="flex flex-col gap-2">
                {abertas.map((v) => (
                  <Link
                    key={v.id}
                    to={`/${empresa.slug}/vendas/${v.id}`}
                    className="flex min-h-14 items-center justify-between rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-2"
                  >
                    <span className="text-base font-bold text-tinta">
                      {reais(v.total)}
                      {v.expand?.entrada && <span className="font-normal text-tinta-suave"> · carro da fila</span>}
                    </span>
                    <span className="text-base font-bold text-marca-forte">Continuar ›</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-tinta-suave">{veTodas ? "Vendas de hoje" : "Minhas vendas de hoje"}</h2>
              <span className="text-lg font-black text-tinta">{reais(totalHoje)}</span>
            </div>
            {hoje.length === 0 ? (
              <EstadoVazio titulo="Nenhuma venda fechada hoje" />
            ) : (
              <div className="flex flex-col gap-2">
                {hoje.map((v) => (
                  <Link
                    key={v.id}
                    to={`/${empresa.slug}/vendas/${v.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-2 shadow-sm hover:border-marca"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-tinta">
                        {hora(v.fechada_em)} · {v.forma_pagamento ? NOME_PAGAMENTO[v.forma_pagamento] : ""}
                      </span>
                      <span className="block truncate text-sm text-tinta-suave">
                        {veTodas && primeiroNome(v.expand?.funcionario?.nome || "")}
                        {v.status === "corrigida" && " · corrigida"}
                      </span>
                    </span>
                    <span className="text-lg font-black text-tinta">{reais(v.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Moldura>
  );
}

// ---------------------------------------------------------------- formulário

export function VendaForm() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario } = useSessao();
  const { id } = useParams();
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const entradaId = busca.get("entrada") || "";

  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [venda, setVenda] = useState<Venda | null>(null);
  const [entrada, setEntrada] = useState<EntradaFila | null>(null);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [forma, setForma] = useState<FormaPagamento | "">("");
  const [corrigindo, setCorrigindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const [erroCarga, setErroCarga] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [confirmarDescartar, setConfirmarDescartar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const lista = await pb.collection("produtos").getFullList<Produto>({
        filter: pb.filter("empresa = {:e}", { e: empresa.id }),
        sort: "nome",
      });
      setProdutos(lista);
      if (id) {
        const v = await pb.collection("vendas").getOne<Venda>(id, { expand: "funcionario" });
        const itens = await pb.collection("vendas_itens").getFullList<VendaItem>({ filter: pb.filter("venda = {:v}", { v: id }) });
        setVenda(v);
        setForma(v.forma_pagamento);
        setQtd(Object.fromEntries(itens.map((i) => [i.produto, i.quantidade])));
        if (v.entrada) setEntrada(await pb.collection("fila_entradas").getOne<EntradaFila>(v.entrada, { expand: "cliente,veiculo" }).catch(() => null));
      } else if (entradaId) {
        const ent = await pb.collection("fila_entradas").getOne<EntradaFila>(entradaId, { expand: "cliente,veiculo" });
        setEntrada(ent);
        // Já vem com o que o cliente pediu no app (menos o que está em falta).
        const pedidos = await pb.collection("itens_pedido").getFullList<ItemPedido>({ filter: pb.filter("entrada = {:e}", { e: entradaId }) });
        setQtd(Object.fromEntries(pedidos.filter((p) => p.status !== "em_falta").map((p) => [p.produto, p.quantidade])));
      }
    } catch (err) {
      setErroCarga(mensagemDeErro(err));
    }
  }, [empresa.id, id, entradaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itens = useMemo(() => Object.entries(qtd).filter(([, q]) => q > 0).map(([produto, quantidade]) => ({ produto, quantidade })), [qtd]);
  const total = useMemo(
    () => itens.reduce((s, it) => s + (produtos?.find((p) => p.id === it.produto)?.preco || 0) * it.quantidade, 0),
    [itens, produtos],
  );

  if (!pode(vinculo, "ver_fila_completa")) return <Navigate to={`/${empresa.slug}`} replace />;
  if (erroCarga) {
    return (
      <Moldura voltarPara={`/${empresa.slug}/vendas`} titulo="Venda">
        <EstadoErro texto={erroCarga} tentar={carregar} />
      </Moldura>
    );
  }
  if (!produtos || (id && !venda)) {
    return (
      <Moldura voltarPara={`/${empresa.slug}/vendas`} titulo="Venda">
        <Carregando />
      </Moldura>
    );
  }

  const minha = !venda || venda.funcionario === usuario?.id;
  const editavel = !venda || (venda.status === "aberta" && minha) || corrigindo;
  const podeCorrigir = !!venda && (venda.status === "fechada" || venda.status === "corrigida") && pode(vinculo, "configurar_empresa");
  const visiveis = produtos.filter(
    (p) => (p.ativo || qtd[p.id]) && (!filtro || p.nome.toLowerCase().includes(filtro.toLowerCase())),
  );

  async function enviar(acao: "salvar" | "fechar" | "corrigir" | "descartar") {
    setErro("");
    if (acao !== "descartar" && !itens.length) return setErro("Adicione pelo menos um produto.");
    if (acao === "fechar" && !forma) {
      setConfirmarFechar(false);
      return setErro("Escolha a forma de pagamento.");
    }
    if (acao === "corrigir" && motivo.trim().length < 3) return setErro("Informe o motivo da correção.");
    setOcupado(acao);
    try {
      if (acao === "corrigir") {
        await pb.send(`/api/lr/vendas/${venda!.id}/corrigir`, { method: "POST", body: { itens, forma_pagamento: forma, motivo: motivo.trim() } });
      } else if (acao === "descartar") {
        await pb.send(`/api/lr/vendas/${venda!.id}/descartar`, { method: "POST" });
      } else if (venda) {
        await pb.send(`/api/lr/vendas/${venda.id}/editar`, { method: "POST", body: { itens, forma_pagamento: forma, fechar: acao === "fechar" } });
      } else {
        await pb.send("/api/lr/vendas", {
          method: "POST",
          body: { empresa: empresa.id, entrada: entradaId, itens, forma_pagamento: forma, fechar: acao === "fechar" },
        });
      }
      navegar(`/${empresa.slug}/vendas`, { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
      setConfirmarFechar(false);
      setConfirmarDescartar(false);
    } finally {
      setOcupado("");
    }
  }

  const titulo = !venda ? "Nova venda" : venda.status === "aberta" ? "Venda aberta" : corrigindo ? "Corrigir venda" : "Venda";

  return (
    <Moldura voltarPara={`/${empresa.slug}/vendas`} titulo={titulo}>
      {entrada && (
        <Cartao className="mb-4">
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-suave">Carro da fila</p>
          <p className="text-lg font-bold text-tinta">
            {nomeDaEntrada(entrada)} · <span className="font-mono">{placaDaEntrada(entrada)}</span>
          </p>
        </Cartao>
      )}
      {venda && venda.status !== "aberta" && (
        <div className="mb-4">
          <Aviso tipo="info">
            {NOME_STATUS_VENDA[venda.status]} em {hora(venda.fechada_em)} por {primeiroNome(venda.expand?.funcionario?.nome || "")}.
            {venda.status === "corrigida" && ` Corrigida pelo patrão: “${venda.motivo_correcao}”.`}
            {!podeCorrigir && venda.status !== "descartada" && " Venda fechada não pode ser alterada. Correção só com o patrão."}
          </Aviso>
        </div>
      )}

      {editavel && produtos.length > 8 && (
        <div className="mb-3">
          <Campo rotulo="Buscar produto" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {produtos.length === 0 && <EstadoVazio titulo="Nenhum produto cadastrado" texto="O patrão cadastra em Produtos." />}
        {(editavel ? visiveis : produtos.filter((p) => qtd[p.id])).map((p) => (
          <div key={p.id} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-2">
            <span className="min-w-0">
              <span className="block truncate text-base font-bold text-tinta">{p.nome}</span>
              <span className="block text-sm text-tinta-suave">
                {reais(p.preco)} · estoque {p.estoque}
              </span>
            </span>
            {editavel ? (
              <Quantidade rotulo={p.nome} valor={qtd[p.id] || 0} onChange={(v) => setQtd((q) => ({ ...q, [p.id]: v }))} />
            ) : (
              <span className="text-lg font-black text-tinta">{qtd[p.id]}×</span>
            )}
          </div>
        ))}
      </div>

      <fieldset className="mt-6">
        <legend className="mb-2 text-base font-bold text-tinta">Forma de pagamento</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(NOME_PAGAMENTO) as FormaPagamento[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={forma === f}
              disabled={!editavel}
              onClick={() => setForma(f)}
              className={`min-h-14 rounded-xl border-2 px-2 text-base font-bold ${forma === f ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"} disabled:opacity-70`}
            >
              {NOME_PAGAMENTO[f]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-tinta-suave">O pagamento é feito no lava rápido. O app só registra a forma.</p>
      </fieldset>

      <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-marca-suave px-4 py-3">
        <span className="text-base font-bold text-tinta">Total</span>
        <span className="text-2xl font-black text-tinta">{reais(total)}</span>
      </div>

      {corrigindo && (
        <div className="mt-4">
          <Campo rotulo="Motivo da correção" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} ajuda="Fica registrado na auditoria." />
        </div>
      )}
      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {editavel && !corrigindo && (
          <>
            <Botao largo carregando={ocupado === "fechar"} disabled={!!ocupado} onClick={() => setConfirmarFechar(true)}>
              Fechar venda
            </Botao>
            <Botao variante="secundario" largo carregando={ocupado === "salvar"} disabled={!!ocupado} onClick={() => enviar("salvar")}>
              Salvar aberta
            </Botao>
            {venda && (
              <Botao variante="fantasma" largo disabled={!!ocupado} onClick={() => setConfirmarDescartar(true)}>
                Descartar venda
              </Botao>
            )}
          </>
        )}
        {corrigindo && (
          <>
            <Botao largo carregando={ocupado === "corrigir"} onClick={() => enviar("corrigir")}>
              Salvar correção
            </Botao>
            <Botao variante="secundario" largo onClick={() => navegar(0)}>
              Desistir
            </Botao>
          </>
        )}
        {podeCorrigir && !corrigindo && (
          <Botao variante="secundario" largo onClick={() => setCorrigindo(true)}>
            Corrigir venda
          </Botao>
        )}
      </div>

      <Confirmar
        aberto={confirmarFechar}
        titulo={`Fechar venda de ${reais(total)}?`}
        texto={`${forma ? NOME_PAGAMENTO[forma] : "Escolha a forma de pagamento"}. Depois de fechada, a venda fica bloqueada e o estoque baixa. Correção só com o patrão.`}
        rotuloConfirmar="Fechar venda"
        carregando={ocupado === "fechar"}
        onConfirmar={() => enviar("fechar")}
        onCancelar={() => setConfirmarFechar(false)}
      />
      <Confirmar
        aberto={confirmarDescartar}
        titulo="Descartar esta venda?"
        texto="Ela não conta em nada e o estoque não muda."
        rotuloConfirmar="Descartar"
        perigo
        carregando={ocupado === "descartar"}
        onConfirmar={() => enviar("descartar")}
        onCancelar={() => setConfirmarDescartar(false)}
      />
    </Moldura>
  );
}
