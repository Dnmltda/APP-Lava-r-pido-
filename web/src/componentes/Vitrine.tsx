import { useEffect, useState } from "react";
import { reais } from "../lib/formato";
import { mensagemDeErro, pb, urlArquivo } from "../lib/pb";
import type { ProdutoCatalogo } from "../lib/tipos";
import { Quantidade } from "./Quantidade";
import { Aviso, Botao, Folha } from "./ui";

// Vitrine de produtos do cliente.
// - Fora da fila: o cliente separa os produtos num carrinho (guardado no aparelho)
//   e eles vão juntos quando ele entrar na fila.
// - Na fila: "Reservar" manda direto para o pedido do carro; a equipe já vê para separar.

export type Carrinho = Record<string, number>;

const chave = (slug: string) => `lr_carrinho_${slug}`;
export function lerCarrinho(slug: string): Carrinho {
  try {
    const c = JSON.parse(localStorage.getItem(chave(slug)) || "{}");
    return c && typeof c === "object" ? c : {};
  } catch {
    return {};
  }
}
export function guardarCarrinho(slug: string, c: Carrinho) {
  try {
    const limpo = Object.fromEntries(Object.entries(c).filter(([, q]) => q > 0));
    if (Object.keys(limpo).length) localStorage.setItem(chave(slug), JSON.stringify(limpo));
    else localStorage.removeItem(chave(slug));
  } catch {
    // modo privado: o carrinho vale só enquanto a tela estiver aberta
  }
}
export function itensDoCarrinho(c: Carrinho) {
  return Object.entries(c)
    .filter(([, q]) => q > 0)
    .map(([produto, quantidade]) => ({ produto, quantidade }));
}

export function useCatalogo(slug: string) {
  const [catalogo, setCatalogo] = useState<ProdutoCatalogo[] | null>(null);
  useEffect(() => {
    pb.send<ProdutoCatalogo[]>(`/api/lr/catalogo/${encodeURIComponent(slug)}`, { method: "GET" })
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, [slug]);
  return catalogo;
}

export function Vitrine({
  catalogo,
  carrinho,
  onCarrinho,
  entradaId,
  onReservado,
}: {
  catalogo: ProdutoCatalogo[];
  carrinho: Carrinho;
  onCarrinho: (c: Carrinho) => void;
  /** Entrada do cliente na fila (se estiver na fila, "Reservar" vai direto para o pedido). */
  entradaId?: string;
  onReservado?: () => void;
}) {
  const [escolhido, setEscolhido] = useState<ProdutoCatalogo | null>(null);
  if (catalogo.length === 0) return null;
  const total = itensDoCarrinho(carrinho).reduce((s, it) => s + (catalogo.find((p) => p.id === it.produto)?.preco || 0) * it.quantidade, 0);
  const qtdCarrinho = itensDoCarrinho(carrinho).reduce((s, it) => s + it.quantidade, 0);

  return (
    <section aria-labelledby="titulo-produtos">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="titulo-produtos" className="text-xl font-extrabold text-tinta">
            Produtos
          </h2>
          <p className="text-sm text-tinta-suave">
            {entradaId ? "Reserve agora: a equipe separa para o seu carro." : "Reserve e eles vão junto quando você entrar na fila."}
          </p>
        </div>
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2" role="list">
        {catalogo.map((p) => (
          <div
            key={p.id}
            role="listitem"
            className={`flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-linha bg-white shadow-sm ${p.disponivel ? "" : "opacity-60"}`}
          >
            {p.foto ? (
              <img src={urlArquivo(p, p.foto, "200x200")} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            ) : (
              <span className="flex aspect-square w-full items-center justify-center bg-marca-suave text-4xl font-black text-marca-forte" aria-hidden="true">
                {p.nome.slice(0, 1)}
              </span>
            )}
            <div className="flex flex-1 flex-col gap-1 p-3">
              <span className="line-clamp-2 text-base font-bold leading-snug text-tinta">{p.nome}</span>
              <span className="text-base font-black text-tinta">{p.disponivel ? reais(p.preco) : "Em falta"}</span>
              {p.disponivel && (
                <button
                  type="button"
                  onClick={() => setEscolhido(p)}
                  className={`mt-auto min-h-11 rounded-xl px-3 text-base font-bold ${carrinho[p.id] && !entradaId ? "bg-marca-suave text-marca-forte" : "bg-marca text-sobre-marca"}`}
                >
                  {!entradaId && carrinho[p.id] ? `${carrinho[p.id]} no carrinho` : "Reservar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!entradaId && qtdCarrinho > 0 && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border-2 border-marca bg-marca-suave px-4 py-3">
          <span className="text-base text-tinta">
            <strong>
              {qtdCarrinho} {qtdCarrinho === 1 ? "produto" : "produtos"}
            </strong>{" "}
            · {reais(total)} — vão junto quando você entrar na fila
          </span>
          <button type="button" onClick={() => onCarrinho({})} className="min-h-11 shrink-0 rounded-xl px-2 text-sm font-bold text-marca-forte">
            Limpar
          </button>
        </div>
      )}
      {escolhido && (
        <Reservar
          produto={escolhido}
          inicial={entradaId ? 1 : carrinho[escolhido.id] || 1}
          entradaId={entradaId}
          onFechar={() => setEscolhido(null)}
          onCarrinho={(q) => {
            onCarrinho({ ...carrinho, [escolhido.id]: q });
            setEscolhido(null);
          }}
          onReservado={() => {
            setEscolhido(null);
            onReservado?.();
          }}
        />
      )}
    </section>
  );
}

function Reservar({
  produto,
  inicial,
  entradaId,
  onFechar,
  onCarrinho,
  onReservado,
}: {
  produto: ProdutoCatalogo;
  inicial: number;
  entradaId?: string;
  onFechar: () => void;
  onCarrinho: (q: number) => void;
  onReservado: () => void;
}) {
  const [qtd, setQtd] = useState(inicial);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!entradaId) return onCarrinho(qtd);
    setEnviando(true);
    setErro("");
    try {
      await pb.send(`/api/lr/fila/${entradaId}/produtos`, { method: "POST", body: { itens: [{ produto: produto.id, quantidade: qtd }] } });
      onReservado();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha titulo="Reservar produto" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {produto.foto ? (
            <img src={urlArquivo(produto, produto.foto, "200x200")} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-marca-suave text-3xl font-black text-marca-forte" aria-hidden="true">
              {produto.nome.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-tinta">{produto.nome}</p>
            <p className="text-base font-bold text-tinta">{reais(produto.preco)}</p>
          </div>
        </div>
        {produto.descricao && <p className="text-base text-tinta-suave">{produto.descricao}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-semibold text-tinta">Quantidade</span>
          <Quantidade rotulo={produto.nome} max={20} valor={qtd} onChange={setQtd} />
        </div>
        <p className="text-sm text-tinta-suave">
          {entradaId ? "A equipe separa para o seu carro. " : "Fica guardado aqui e vai junto quando você entrar na fila. "}
          Pagamento só no lava rápido.
        </p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={enviando} disabled={entradaId ? qtd === 0 : false} onClick={confirmar}>
          {entradaId ? `Reservar ${qtd > 0 ? `· ${reais(produto.preco * qtd)}` : ""}` : qtd === 0 ? "Tirar do carrinho" : `Pôr no carrinho · ${reais(produto.preco * qtd)}`}
        </Botao>
      </div>
    </Folha>
  );
}
