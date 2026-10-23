import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { mensagemDeErro, pb } from "../lib/pb";
import { acharModelo, esquecerModelos, PORTES, type ModeloConhecido } from "../lib/porteVeiculo";
import type { Porte } from "../lib/tipos";

// Tabela de tamanhos do lava rápido: o dono decide se cada modelo é pequeno, médio, grande ou moto
// (ex.: "Strada é médio aqui"). Vale para todos os clientes deste lava rápido; para um cliente
// específico continua o "Cobrar como" na tela de Clientes.

const sem = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Tamanhos() {
  const { empresa, vinculo, recarregarEmpresa } = useEmpresa();
  const [lista, setLista] = useState<ModeloConhecido[] | null>(null);
  const [busca, setBusca] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoPorte, setNovoPorte] = useState<Porte | "">("");
  const [salvando, setSalvando] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLista(await pb.send<ModeloConhecido[]>("/api/lr/modelos", { method: "GET", query: { empresa: empresa.id } }));
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const ajustados = useMemo(() => (lista || []).filter((m) => m.ajustado), [lista]);
  const filtrada = useMemo(() => {
    const b = sem(busca.trim());
    return (lista || []).filter((m) => !b || sem(m.nome).includes(b));
  }, [lista, busca]);

  if (vinculo?.papel !== "patrao") return <Navigate to={`/${empresa.slug}`} replace />;

  // Grava a tabela inteira de ajustes (o servidor valida). Escolher o tamanho padrão tira o ajuste.
  async function gravar(nome: string, porte: Porte | "", aviso: string) {
    setErro("");
    setMsg("");
    const atuais: Record<string, Porte> = {};
    for (const m of lista || []) if (m.ajustado) atuais[m.nome] = m.porte;
    const existente = (lista || []).find((m) => sem(m.nome) === sem(nome));
    const chave = existente?.nome || nome.trim();
    if (!porte || (existente && existente.padrao && existente.padrao === porte)) delete atuais[chave];
    else atuais[chave] = porte;
    setSalvando(chave);
    try {
      await pb.collection("empresas").update(empresa.id, { tamanhos_modelos: atuais });
      esquecerModelos(empresa.id);
      await Promise.all([carregar(), recarregarEmpresa()]);
      setMsg(aviso);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando("");
    }
  }

  async function incluir() {
    const nome = novoNome.replace(/\s+/g, " ").trim();
    if (nome.length < 2) return setErro("Digite o modelo (ex.: Strada).");
    if (!novoPorte) return setErro("Escolha o tamanho.");
    const achado = lista ? acharModelo(lista, nome) : null;
    const alvo = achado && sem(achado.nome) === sem(nome) ? achado.nome : nome;
    await gravar(alvo, novoPorte, `${alvo}: agora é ${nomeTamanho(novoPorte).toLowerCase()} no ${empresa.nome}.`);
    setNovoNome("");
    setNovoPorte("");
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Tamanho dos carros">
      <p className="text-base text-tinta-suave">
        O preço de cada carro sai pelo tamanho do modelo. Aqui você decide o tamanho de cada modelo <strong>no seu lava rápido</strong>. Vale para todos os
        clientes, nas próximas entradas na fila.
      </p>
      <p className="mt-2 text-sm text-tinta-suave">
        Quer um preço especial só para um cliente (ex.: carro grande cobrado como médio)? Use <strong>Cobrar como</strong> no carro dele, em{" "}
        <Link to={`/${empresa.slug}/clientes`} className="font-bold text-marca-forte underline">
          Clientes
        </Link>
        .
      </p>

      <section className="mt-5 rounded-2xl border border-linha bg-white p-4" aria-labelledby="titulo-incluir">
        <h2 id="titulo-incluir" className="text-lg font-extrabold text-tinta">
          Incluir ou mudar um modelo
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          <Campo rotulo="Modelo" placeholder="Ex.: Strada, Saveiro, Montana" list="lista-modelos" maxLength={40} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          <datalist id="lista-modelos">
            {(lista || []).map((m) => (
              <option key={m.nome} value={m.nome} />
            ))}
          </datalist>
          <EscolherTamanho valor={novoPorte} onChange={setNovoPorte} rotulo="Tamanho" />
          <Botao largo carregando={!!salvando && salvando === novoNome.trim()} onClick={incluir}>
            Salvar tamanho
          </Botao>
        </div>
      </section>

      {msg && (
        <div className="mt-4">
          <Aviso tipo="sucesso">{msg}</Aviso>
        </div>
      )}
      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      {ajustados.length > 0 && (
        <section className="mt-6" aria-labelledby="titulo-ajustes">
          <h2 id="titulo-ajustes" className="text-lg font-extrabold text-tinta">
            Seus ajustes ({ajustados.length})
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {ajustados.map((m) => (
              <li key={m.nome} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dourado bg-white px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-base font-bold text-tinta">{m.nome}</span>
                  <span className="block text-sm text-tinta-suave">
                    {nomeTamanho(m.porte)} {m.padrao ? `· na lista geral é ${nomeTamanho(m.padrao).toLowerCase()}` : "· incluído por você"}
                  </span>
                </span>
                <Botao variante="secundario" carregando={salvando === m.nome} disabled={!!salvando} onClick={() => gravar(m.nome, "", `${m.nome}: ${m.padrao ? "voltou ao tamanho padrão" : "tirado da sua tabela"}.`)}>
                  {m.padrao ? "Voltar ao padrão" : "Tirar"}
                </Botao>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-labelledby="titulo-tabela">
        <h2 id="titulo-tabela" className="text-lg font-extrabold text-tinta">
          Tabela completa
        </h2>
        <div className="mt-2">
          <Campo rotulo="Procurar modelo" placeholder="Ex.: Corolla" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {lista === null ? (
          <Carregando />
        ) : (
          PORTES.map((p) => {
            const doTamanho = filtrada.filter((m) => m.porte === p.id);
            if (!doTamanho.length) return null;
            return (
              <div key={p.id} className="mt-4">
                <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">
                  {p.id === "moto" ? "Motos" : `Carros ${p.nome.toLowerCase()}s`} ({doTamanho.length})
                </h3>
                <ul className="flex flex-col gap-2">
                  {doTamanho.map((m) => (
                    <li key={m.nome} className="rounded-2xl border border-linha bg-white px-3 py-2">
                      <p className="text-base font-bold text-tinta">
                        {m.nome}
                        {m.ajustado && <span className="ml-2 text-sm font-semibold text-dourado-escuro">ajustado</span>}
                      </p>
                      <EscolherTamanho
                        compacto
                        rotulo={`Tamanho do ${m.nome}`}
                        valor={m.porte}
                        desabilitado={!!salvando}
                        onChange={(novo) => novo !== m.porte && gravar(m.nome, novo, `${m.nome}: agora é ${nomeTamanho(novo).toLowerCase()} no ${empresa.nome}.`)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </Moldura>
  );
}

function nomeTamanho(p: Porte | "") {
  return PORTES.find((x) => x.id === p)?.nome || "";
}

function EscolherTamanho({
  valor,
  onChange,
  rotulo,
  compacto,
  desabilitado,
}: {
  valor: Porte | "";
  onChange: (p: Porte) => void;
  rotulo: string;
  compacto?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={`grid grid-cols-4 gap-1.5 ${compacto ? "mt-1.5" : ""}`}>
      {PORTES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={valor === p.id}
          disabled={desabilitado}
          onClick={() => onChange(p.id)}
          className={`${compacto ? "min-h-10 text-sm" : "min-h-12 text-base"} rounded-xl border-2 font-bold disabled:opacity-60 ${
            valor === p.id ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"
          }`}
        >
          {p.nome}
        </button>
      ))}
    </div>
  );
}
