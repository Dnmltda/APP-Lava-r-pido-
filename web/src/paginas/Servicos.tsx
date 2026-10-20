import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, EstadoVazio, Folha, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { duracao, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { tiposDaEmpresa } from "../componentes/TipoVeiculo";
import type { Servico, TipoVeiculo } from "../lib/tipos";

const paraNumero = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));
const paraTexto = (n: number) => String(n).replace(".", ",");

export function Servicos() {
  const { empresa, vinculo } = useEmpresa();
  const [lista, setLista] = useState<Servico[] | null>(null);
  const [editandoTipos, setEditandoTipos] = useState(false);
  const tipos = tiposDaEmpresa(empresa);
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

  if (!pode(vinculo, "catalogo")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Serviços">
      <Botao largo onClick={() => setEditando("novo")}>
        + Novo serviço
      </Botao>
      <p className="mt-3 text-base text-tinta-suave">O tempo médio de cada serviço é usado para calcular a previsão da fila.</p>
      <div className="mt-4 rounded-2xl border border-linha bg-white p-4">
        <p className="text-base font-bold text-tinta">Tipos de veículo e convênios</p>
        <p className="mt-1 text-base text-tinta-suave">
          {tipos.length ? tipos.map((t) => t.nome).join(" · ") : "Nenhum ainda. Todos pagam o preço padrão do serviço."}
        </p>
        {pode(vinculo, "configurar_empresa") && (
          <Botao variante="secundario" largo className="mt-3" onClick={() => setEditandoTipos(true)}>
            {tipos.length ? "Editar tipos" : "Criar tipos (pequeno, grande, moto, convênio…)"}
          </Botao>
        )}
      </div>
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
                  {reais(s.preco)}
                  {tipos.some((t) => typeof s.precos_tipo?.[t.id] === "number") && " (varia por tipo)"} · ~{duracao(s.duracao_media_min)}
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
          tipos={tipos}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
      {editandoTipos && <EditarTipos onFechar={() => setEditandoTipos(false)} />}
    </Moldura>
  );
}

function EditarTipos({ onFechar }: { onFechar: () => void }) {
  const { empresa, recarregarEmpresa } = useEmpresa();
  const [lista, setLista] = useState<TipoVeiculo[]>(() => tiposDaEmpresa(empresa).map((t) => ({ ...t })));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (i: number, parcial: Partial<TipoVeiculo>) => setLista((l) => l.map((t, j) => (j === i ? { ...t, ...parcial } : t)));

  async function salvar() {
    setErro("");
    const limpos = lista.map((t) => ({ ...t, nome: t.nome.trim() }));
    if (limpos.some((t) => t.nome.length < 2)) return setErro("Dê um nome para cada tipo (ou tire o que sobrou).");
    setSalvando(true);
    try {
      await pb.collection("empresas").update(empresa.id, { tipos_veiculo: limpos });
      await recarregarEmpresa();
      onFechar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Tipos de veículo e convênios" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <p className="text-base text-tinta-suave">
          Crie os tipos que mudam o preço: porte (pequeno, grande, moto), motorista de app ou empresas com convênio. Depois, em cada serviço, coloque o preço de cada tipo.
        </p>
        {lista.map((t, i) => (
          <div key={t.id || `novo-${i}`} className="flex flex-col gap-3 rounded-2xl border border-linha bg-white p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Campo rotulo={`Tipo ${i + 1}`} placeholder="Ex.: Carro grande / SUV" value={t.nome} maxLength={40} onChange={(e) => mudar(i, { nome: e.target.value })} />
              </div>
              <button
                type="button"
                onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                className="min-h-12 rounded-xl px-3 text-base font-bold text-red-700 hover:bg-red-50"
                aria-label={`Tirar ${t.nome || "tipo"}`}
              >
                Tirar
              </button>
            </div>
            <Interruptor
              rotulo="Só a equipe define (convênio, Uber…)"
              descricao="O cliente não escolhe este tipo sozinho. A equipe marca na fila e o app lembra nas próximas vezes."
              ligado={t.restrito}
              onChange={(v) => mudar(i, { restrito: v })}
            />
          </div>
        ))}
        {lista.length < 12 && (
          <Botao variante="secundario" largo onClick={() => setLista((l) => [...l, { id: "", nome: "", restrito: false }])}>
            + Adicionar tipo
          </Botao>
        )}
        <p className="text-sm text-tinta-suave">Tirar um tipo não muda quem já está na fila. Quem não tiver tipo paga o preço padrão.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao largo carregando={salvando} onClick={salvar}>
          Salvar tipos
        </Botao>
      </div>
    </Folha>
  );
}

function EditarServico({
  servico,
  empresaId,
  tipos,
  onFechar,
  onSalvo,
}: {
  servico: Servico | null;
  empresaId: string;
  tipos: TipoVeiculo[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(servico?.nome || "");
  const [descricao, setDescricao] = useState(servico?.descricao || "");
  const [preco, setPreco] = useState(servico ? String(servico.preco).replace(".", ",") : "");
  const [dur, setDur] = useState(servico ? String(servico.duracao_media_min) : "30");
  const [ordem, setOrdem] = useState(servico ? String(servico.ordem_exibicao || "") : "");
  const [ativo, setAtivo] = useState(servico ? servico.ativo : true);
  const [precosTipo, setPrecosTipo] = useState<Record<string, string>>(() =>
    Object.fromEntries(tipos.map((t) => [t.id, typeof servico?.precos_tipo?.[t.id] === "number" ? paraTexto(servico.precos_tipo[t.id]) : ""])),
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const valor = paraNumero(preco);
    const minutos = parseInt(dur, 10);
    if (nome.trim().length < 2) return setErro("Digite o nome do serviço.");
    if (!preco.trim() || isNaN(valor) || valor < 0) return setErro("Preço inválido.");
    if (!minutos || minutos < 1 || minutos > 600) return setErro("Tempo médio entre 1 e 600 minutos.");
    const precos_tipo: Record<string, number> = {};
    for (const t of tipos) {
      const txt = (precosTipo[t.id] || "").trim();
      if (!txt) continue;
      const v = paraNumero(txt);
      if (isNaN(v) || v < 0) return setErro(`Preço inválido para ${t.nome}.`);
      precos_tipo[t.id] = Math.round(v * 100) / 100;
    }
    const dados = {
      empresa: empresaId,
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: Math.round(valor * 100) / 100,
      duracao_media_min: minutos,
      ordem_exibicao: parseInt(ordem, 10) || 0,
      ativo,
      precos_tipo,
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
        {tipos.length > 0 && (
          <fieldset className="flex flex-col gap-3 rounded-2xl border border-linha bg-white p-3">
            <legend className="px-1 text-base font-bold text-tinta">Preço por tipo de veículo</legend>
            <p className="text-sm text-tinta-suave">Deixe em branco para usar o preço padrão acima.</p>
            <div className="grid grid-cols-2 gap-3">
              {tipos.map((t) => (
                <Campo
                  key={t.id}
                  rotulo={`${t.nome} (R$)`}
                  inputMode="decimal"
                  placeholder={preco || "padrão"}
                  value={precosTipo[t.id] || ""}
                  onChange={(e) => setPrecosTipo((p) => ({ ...p, [t.id]: e.target.value.replace(/[^\d,.]/g, "") }))}
                />
              ))}
            </div>
          </fieldset>
        )}
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
