import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, EstadoVazio, Folha, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { reais } from "../lib/formato";
import { mensagemDeErro, pb, urlArquivo } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { Produto, TipoComissao } from "../lib/tipos";

export function estoqueBaixo(p: Produto) {
  return p.ativo && p.estoque <= p.estoque_minimo;
}

function textoComissao(p: Produto) {
  if (p.comissao_tipo === "fixo") return `comissão ${reais(p.comissao_valor)}/un.`;
  if (p.comissao_tipo === "percentual") return `comissão ${p.comissao_valor}%`;
  return "";
}

export function Produtos() {
  const { empresa, vinculo, recarregarEmpresa } = useEmpresa();
  const [lista, setLista] = useState<Produto[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Produto | "novo" | null>(null);
  const [salvandoComissao, setSalvandoComissao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(
        await pb.collection("produtos").getFullList<Produto>({
          filter: pb.filter("empresa = {:e}", { e: empresa.id }),
          sort: "-ativo,nome",
        }),
      );
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!pode(vinculo, "catalogo")) return <Navigate to={`/${empresa.slug}`} replace />;

  async function alternarComissao(v: boolean) {
    setSalvandoComissao(true);
    try {
      await pb.collection("empresas").update(empresa.id, { comissao_ativa: v });
      await recarregarEmpresa();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvandoComissao(false);
    }
  }

  const baixos = lista?.filter(estoqueBaixo) || [];

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Produtos">
      <Botao largo onClick={() => setEditando("novo")}>
        + Novo produto
      </Botao>
      <div className="mt-4">
        <Interruptor
          rotulo="Comissão por produto"
          descricao="Quando ligada, cada venda fechada calcula a comissão de quem vendeu."
          ligado={!!empresa.comissao_ativa}
          disabled={salvandoComissao}
          onChange={alternarComissao}
        />
      </div>
      {baixos.length > 0 && (
        <div className="mt-4">
          <Aviso>
            <strong>Estoque baixo:</strong> {baixos.map((p) => `${p.nome} (${p.estoque})`).join(", ")}
          </Aviso>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3">
        {erro ? (
          <EstadoErro texto={erro} tentar={carregar} />
        ) : lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Nenhum produto ainda" texto="Cadastre os produtos que o lava rápido vende (cheirinho, pretinho, aromatizante…)." />
        ) : (
          lista.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditando(p)}
              className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left shadow-sm hover:border-marca ${estoqueBaixo(p) ? "border-2 border-red-400" : "border-linha"} ${p.ativo ? "" : "opacity-60"}`}
            >
              {p.foto ? (
                <img src={urlArquivo(p, p.foto, "200x200")} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-fundo text-xl font-black text-tinta-suave">{p.nome.slice(0, 1)}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold text-tinta">{p.nome}</span>
                <span className="block text-base text-tinta-suave">
                  {reais(p.preco)} · estoque <strong className={estoqueBaixo(p) ? "text-red-700" : "text-tinta"}>{p.estoque}</strong>
                  {!p.ativo && " · desativado"}
                </span>
                {empresa.comissao_ativa && textoComissao(p) && <span className="block text-sm text-tinta-suave">{textoComissao(p)}</span>}
              </span>
              <span className="text-2xl text-marca" aria-hidden="true">›</span>
            </button>
          ))
        )}
      </div>
      {editando && (
        <EditarProduto
          produto={editando === "novo" ? null : editando}
          empresaId={empresa.id}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function numero(v: string) {
  return Number(v.replace(/\./g, "").replace(",", "."));
}

function EditarProduto({ produto, empresaId, onFechar, onSalvo }: { produto: Produto | null; empresaId: string; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(produto?.nome || "");
  const [descricao, setDescricao] = useState(produto?.descricao || "");
  const [preco, setPreco] = useState(produto ? String(produto.preco).replace(".", ",") : "");
  const [estoque, setEstoque] = useState(produto ? String(produto.estoque) : "0");
  const [minimo, setMinimo] = useState(produto ? String(produto.estoque_minimo) : "2");
  const [tipo, setTipo] = useState<TipoComissao>(produto?.comissao_tipo || "nenhuma");
  const [comissao, setComissao] = useState(produto ? String(produto.comissao_valor || "").replace(".", ",") : "");
  const [ativo, setAtivo] = useState(produto ? produto.ativo : true);
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState(produto?.foto ? urlArquivo(produto, produto.foto, "200x200") : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const valor = numero(preco);
    const est = parseInt(estoque, 10);
    const min = parseInt(minimo, 10);
    const com = tipo === "nenhuma" ? 0 : numero(comissao);
    if (nome.trim().length < 2) return setErro("Digite o nome do produto.");
    if (!preco.trim() || isNaN(valor) || valor < 0) return setErro("Preço inválido.");
    if (isNaN(est)) return setErro("Estoque inválido.");
    if (isNaN(min) || min < 0) return setErro("Estoque mínimo inválido.");
    if (tipo !== "nenhuma" && (isNaN(com) || com <= 0)) return setErro("Informe o valor da comissão.");
    if (tipo === "percentual" && com > 100) return setErro("A porcentagem vai até 100.");
    const dados = new FormData();
    dados.append("empresa", empresaId);
    dados.append("nome", nome.trim());
    dados.append("descricao", descricao.trim());
    dados.append("preco", String(Math.round(valor * 100) / 100));
    dados.append("estoque", String(est));
    dados.append("estoque_minimo", String(min));
    dados.append("comissao_tipo", tipo);
    dados.append("comissao_valor", String(com));
    dados.append("ativo", String(ativo));
    if (foto) dados.append("foto", foto);
    setSalvando(true);
    try {
      if (produto) await pb.collection("produtos").update(produto.id, dados);
      else await pb.collection("produtos").create(dados);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={produto ? "Editar produto" : "Novo produto"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-4">
          {previa ? (
            <img src={previa} alt="" className="h-20 w-20 rounded-2xl border border-linha object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-linha text-sm text-tinta-suave">Sem foto</span>
          )}
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border-2 border-linha bg-white px-5 text-base font-bold text-tinta">
            Escolher foto
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 3 * 1024 * 1024) return setErro("A foto precisa ter no máximo 3 MB.");
                setFoto(f);
                setPrevia(URL.createObjectURL(f));
              }}
            />
          </label>
        </div>
        <Campo rotulo="Nome" placeholder="Cheirinho de carro" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} />
        <Campo rotulo="Preço (R$)" inputMode="decimal" placeholder="15,00" value={preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ""))} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Estoque" type="number" inputMode="numeric" value={estoque} onChange={(e) => setEstoque(e.target.value)} />
          <Campo rotulo="Avisar abaixo de" type="number" inputMode="numeric" min={0} value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </div>
        <fieldset>
          <legend className="mb-2 text-base font-bold text-tinta">Comissão de quem vende</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["nenhuma", "Nenhuma"],
                ["fixo", "R$ por un."],
                ["percentual", "% do valor"],
              ] as [TipoComissao, string][]
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={tipo === v}
                onClick={() => setTipo(v)}
                className={`min-h-12 rounded-xl border-2 px-2 text-base font-bold ${tipo === v ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </fieldset>
        {tipo !== "nenhuma" && (
          <Campo
            rotulo={tipo === "fixo" ? "Valor por unidade (R$)" : "Porcentagem (%)"}
            inputMode="decimal"
            value={comissao}
            onChange={(e) => setComissao(e.target.value.replace(/[^\d,.]/g, ""))}
          />
        )}
        <Interruptor rotulo="À venda" descricao="Desligado: some do app do cliente e das vendas." ligado={ativo} onChange={setAtivo} />
        {produto && <p className="text-sm text-tinta-suave">Toda mudança de preço, estoque ou comissão fica registrada.</p>}
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar
        </Botao>
      </form>
    </Folha>
  );
}
