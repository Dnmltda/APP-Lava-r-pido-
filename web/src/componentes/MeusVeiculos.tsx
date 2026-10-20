import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CamposVeiculo, corpoVeiculo, validarVeiculo, VEICULO_VAZIO } from "./CamposVeiculo";
import { Aviso, Botao, Carregando, Confirmar, EstadoErro, Folha } from "./ui";
import { useSessao } from "../contexto/Sessao";
import { mensagemDeErro, pb } from "../lib/pb";
import type { Veiculo } from "../lib/tipos";

export function useMeusVeiculos() {
  const { usuario } = useSessao();
  const [veiculos, setVeiculos] = useState<Veiculo[] | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    if (!usuario) return;
    try {
      setVeiculos(
        await pb.collection("veiculos").getFullList<Veiculo>({
          filter: pb.filter("cliente = {:u} && ativo = true", { u: usuario.id }),
          sort: "created",
        }),
      );
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [usuario]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  return { veiculos, erro, recarregar: carregar };
}

export function descricaoVeiculo(v: Veiculo) {
  return [v.placa || `…${v.final_placa}`, v.modelo, v.cor].filter(Boolean).join(" · ");
}

export function NovoVeiculo({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (v: Veiculo) => void }) {
  const { usuario } = useSessao();
  const [dados, setDados] = useState(VEICULO_VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const novos = validarVeiculo(dados);
    setErros(novos);
    if (Object.keys(novos).length) return;
    setSalvando(true);
    setErro("");
    try {
      const v = await pb.collection("veiculos").create<Veiculo>({ cliente: usuario!.id, ...corpoVeiculo(dados) });
      onSalvo(v);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Novo veículo" onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <CamposVeiculo valor={dados} onChange={setDados} erros={erros} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar veículo
        </Botao>
      </form>
    </Folha>
  );
}

export function MeusVeiculos() {
  const { veiculos, erro, recarregar } = useMeusVeiculos();
  const [novo, setNovo] = useState(false);
  const [removendo, setRemovendo] = useState<Veiculo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState("");

  async function remover() {
    if (!removendo) return;
    setOcupado(true);
    try {
      await pb.collection("veiculos").update(removendo.id, { ativo: false });
      setRemovendo(null);
      recarregar();
    } catch (err) {
      setErroAcao(mensagemDeErro(err));
      setRemovendo(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-extrabold text-tinta">Meus veículos</h2>
      {erro ? (
        <EstadoErro texto={erro} tentar={recarregar} />
      ) : veiculos === null ? (
        <Carregando />
      ) : veiculos.length === 0 ? (
        <p className="text-base text-tinta-suave">Nenhum veículo cadastrado.</p>
      ) : (
        veiculos.map((v) => (
          <div key={v.id} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-2">
            <span className="text-base font-semibold text-tinta">{descricaoVeiculo(v)}</span>
            <button onClick={() => setRemovendo(v)} className="min-h-12 rounded-xl px-3 text-base font-bold text-red-700 hover:bg-red-50">
              Remover
            </button>
          </div>
        ))
      )}
      {erroAcao && <Aviso>{erroAcao}</Aviso>}
      <Botao variante="secundario" largo onClick={() => setNovo(true)}>
        + Adicionar veículo
      </Botao>
      {novo && (
        <NovoVeiculo
          onFechar={() => setNovo(false)}
          onSalvo={() => {
            setNovo(false);
            recarregar();
          }}
        />
      )}
      <Confirmar
        aberto={!!removendo}
        titulo="Remover veículo?"
        texto={removendo ? descricaoVeiculo(removendo) : ""}
        rotuloConfirmar="Remover"
        perigo
        carregando={ocupado}
        onConfirmar={remover}
        onCancelar={() => setRemovendo(null)}
      />
    </section>
  );
}
