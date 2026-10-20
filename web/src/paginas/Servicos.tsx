import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, EstadoVazio, Folha, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { duracao, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { Servico } from "../lib/tipos";

export function Servicos() {
  const { empresa, vinculo } = useEmpresa();
  const [lista, setLista] = useState<Servico[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Servico | "novo" | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(
        await pb.collection("servicos").getFullList<Servico>({
          filter: pb.filter("empresa = {:e}", { e: empresa.id }),
          sort: "-ativo,ordem_exibicao,nome",
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

  if (!pode(vinculo, "configurar_empresa")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Serviços">
      <Botao largo onClick={() => setEditando("novo")}>
        + Novo serviço
      </Botao>
      <p className="mt-3 text-base text-tinta-suave">O tempo médio de cada serviço é usado para calcular a previsão da fila.</p>
      <div className="mt-5 flex flex-col gap-3">
        {erro ? (
          <EstadoErro texto={erro} tentar={carregar} />
        ) : lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Nenhum serviço ainda" texto="Cadastre os serviços para os clientes poderem entrar na fila." />
        ) : (
          lista.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditando(s)}
              className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 text-left shadow-sm hover:border-marca ${s.ativo ? "" : "opacity-60"}`}
            >
              <span className="min-w-0">
                <span className="block text-lg font-bold text-tinta">{s.nome}</span>
                <span className="block text-base text-tinta-suave">
                  {reais(s.preco)} · ~{duracao(s.duracao_media_min)}
                  {!s.ativo && " · desativado"}
                </span>
              </span>
              <span className="text-2xl text-marca" aria-hidden="true">›</span>
            </button>
          ))
        )}
      </div>
      {editando && (
        <EditarServico
          servico={editando === "novo" ? null : editando}
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

function EditarServico({
  servico,
  empresaId,
  onFechar,
  onSalvo,
}: {
  servico: Servico | null;
  empresaId: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(servico?.nome || "");
  const [descricao, setDescricao] = useState(servico?.descricao || "");
  const [preco, setPreco] = useState(servico ? String(servico.preco).replace(".", ",") : "");
  const [dur, setDur] = useState(servico ? String(servico.duracao_media_min) : "30");
  const [ordem, setOrdem] = useState(servico ? String(servico.ordem_exibicao || "") : "");
  const [ativo, setAtivo] = useState(servico ? servico.ativo : true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const valor = Number(preco.replace(/\./g, "").replace(",", "."));
    const minutos = parseInt(dur, 10);
    if (nome.trim().length < 2) return setErro("Digite o nome do serviço.");
    if (!preco.trim() || isNaN(valor) || valor < 0) return setErro("Preço inválido.");
    if (!minutos || minutos < 1 || minutos > 600) return setErro("Tempo médio entre 1 e 600 minutos.");
    const dados = {
      empresa: empresaId,
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: Math.round(valor * 100) / 100,
      duracao_media_min: minutos,
      ordem_exibicao: parseInt(ordem, 10) || 0,
      ativo,
    };
    setSalvando(true);
    try {
      if (servico) await pb.collection("servicos").update(servico.id, dados);
      else await pb.collection("servicos").create(dados);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={servico ? "Editar serviço" : "Novo serviço"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="Nome" placeholder="Lavagem completa" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Descrição (opcional)" placeholder="Por dentro e por fora, com cera" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Preço (R$)" inputMode="decimal" placeholder="60,00" value={preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ""))} />
          <Campo rotulo="Tempo médio (min)" type="number" inputMode="numeric" min={1} max={600} value={dur} onChange={(e) => setDur(e.target.value)} />
        </div>
        <Campo rotulo="Posição na lista (opcional)" type="number" inputMode="numeric" value={ordem} onChange={(e) => setOrdem(e.target.value)} ajuda="Números menores aparecem primeiro para o cliente." />
        <Interruptor rotulo="Disponível para os clientes" ligado={ativo} onChange={setAtivo} />
        {servico && <p className="text-sm text-tinta-suave">Mudar o preço ou o tempo não altera quem já está na fila.</p>}
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar
        </Botao>
      </form>
    </Folha>
  );
}
