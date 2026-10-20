import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, Cartao, Confirmar, EstadoErro, EstadoVazio, Folha, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { celularValido, linkWhatsApp, mascaraCelular, reais, somenteDigitos } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { NOME_PAPEL, type Papel, type RegraBonus, type Vinculo } from "../lib/tipos";

const ORDEM: Record<Papel, number> = { patrao: 0, gerente: 1, funcionario: 2, cliente: 3 };

export function Equipe() {
  const { empresa, vinculo } = useEmpresa();
  const [lista, setLista] = useState<Vinculo[] | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Vinculo | null>(null);
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const itens = await pb.collection("vinculos").getFullList<Vinculo>({
        filter: pb.filter('empresa = {:e} && papel != "cliente"', { e: empresa.id }),
        expand: "usuario",
      });
      itens.sort(
        (a, b) =>
          Number(b.ativo) - Number(a.ativo) ||
          ORDEM[a.papel] - ORDEM[b.papel] ||
          (a.expand?.usuario?.nome || "").localeCompare(b.expand?.usuario?.nome || "", "pt-BR"),
      );
      setLista(itens);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!pode(vinculo, "gerenciar_equipe")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Equipe">
      <Botao largo onClick={() => setNovo(true)}>
        + Adicionar pessoa
      </Botao>
      <div className="mt-4">
        <CartaoBonus empresaId={empresa.id} />
      </div>
      {mensagem && (
        <div className="mt-4">
          <Aviso tipo="sucesso">{mensagem}</Aviso>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3">
        {erro ? (
          <EstadoErro texto={erro} tentar={carregar} />
        ) : lista === null ? (
          <Carregando />
        ) : lista.length <= 1 ? (
          <EstadoVazio titulo="Só você por enquanto" texto="Cadastre gerente e funcionários. Cada pessoa tem o próprio login." />
        ) : null}
        {lista?.map((v) => (
          <button
            key={v.id}
            onClick={() => v.papel !== "patrao" && setEditando(v)}
            disabled={v.papel === "patrao"}
            className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 text-left shadow-sm enabled:hover:border-marca ${v.ativo ? "" : "opacity-60"}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold text-tinta">{v.expand?.usuario?.nome}</span>
              <span className="block text-base text-tinta-suave">{mascaraCelular(v.expand?.usuario?.celular || "")}</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <Etiqueta>{NOME_PAPEL[v.papel]}</Etiqueta>
                {v.papel === "funcionario" && v.responsavel_fila && <Etiqueta>Responsável pela fila</Etiqueta>}
                {v.perm_clientes && <Etiqueta>Clientes</Etiqueta>}
                {v.papel === "funcionario" && v.perm_valores && <Etiqueta>Valores</Etiqueta>}
                {v.perm_cameras && <Etiqueta>Câmeras</Etiqueta>}
                {v.perm_catalogo && <Etiqueta>Preços</Etiqueta>}
                {!v.ativo && <Etiqueta cinza>Desativado</Etiqueta>}
              </span>
            </span>
            {v.papel !== "patrao" && <span className="text-2xl text-marca" aria-hidden="true">›</span>}
          </button>
        ))}
      </div>

      {novo && (
        <NovaPessoa
          empresaId={empresa.id}
          onFechar={() => setNovo(false)}
          onSalvo={(msg) => {
            setNovo(false);
            setMensagem(msg);
            carregar();
          }}
        />
      )}
      {editando && (
        <EditarPessoa
          vinculo={editando}
          onFechar={() => setEditando(null)}
          onSalvo={(msg) => {
            setEditando(null);
            setMensagem(msg);
            carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function Etiqueta({ children, cinza }: { children: React.ReactNode; cinza?: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${cinza ? "bg-gray-200 text-gray-700" : "bg-marca-suave text-marca-forte"}`}>
      {children}
    </span>
  );
}

function EscolhaPapel({ valor, onChange }: { valor: Papel; onChange: (p: Papel) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-base font-semibold text-tinta">Função</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["funcionario", "gerente"] as Papel[]).map((p) => (
          <button
            type="button"
            key={p}
            aria-pressed={valor === p}
            onClick={() => onChange(p)}
            className={`min-h-12 rounded-xl border-2 text-base font-bold ${valor === p ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
          >
            {NOME_PAPEL[p]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NovaPessoa({ empresaId, onFechar, onSalvo }: { empresaId: string; onFechar: () => void; onSalvo: (msg: string) => void }) {
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("funcionario");
  const [respFila, setRespFila] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!celularValido(celular)) return setErro("Digite o celular com DDD.");
    setEnviando(true);
    try {
      const r = await pb.send<{ conta_existente: boolean }>("/api/lr/equipe", {
        method: "POST",
        body: {
          empresa: empresaId,
          nome: nome.trim(),
          celular: somenteDigitos(celular),
          senha,
          papel,
          responsavel_fila: papel === "funcionario" && respFila,
        },
      });
      onSalvo(
        r.conta_existente
          ? "Essa pessoa já tinha cadastro no app. Ela entra com o celular e a senha que já usa."
          : "Pessoa cadastrada. Passe o celular e a senha para ela entrar.",
      );
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha titulo="Adicionar pessoa" onFechar={onFechar}>
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Campo
          rotulo="Celular"
          type="tel"
          inputMode="numeric"
          placeholder="(11) 98765-4321"
          value={celular}
          onChange={(e) => setCelular(mascaraCelular(e.target.value))}
          ajuda="Será o login da pessoa."
        />
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo
          rotulo="Senha inicial"
          type="text"
          autoComplete="off"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          ajuda="Mínimo de 8 caracteres. Se a pessoa já tiver cadastro no app, nome e senha dela não mudam."
        />
        <EscolhaPapel valor={papel} onChange={setPapel} />
        {papel === "funcionario" && (
          <Interruptor
            rotulo="Responsável pela fila"
            descricao="Pode confirmar, recusar e reorganizar a fila quando o gerente não estiver."
            ligado={respFila}
            onChange={setRespFila}
          />
        )}
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={enviando}>
          Cadastrar
        </Botao>
      </form>
    </Folha>
  );
}

function EditarPessoa({ vinculo, onFechar, onSalvo }: { vinculo: Vinculo; onFechar: () => void; onSalvo: (msg: string) => void }) {
  const u = vinculo.expand?.usuario;
  const [papel, setPapel] = useState<Papel>(vinculo.papel);
  const [respFila, setRespFila] = useState(vinculo.responsavel_fila);
  const [acessos, setAcessos] = useState({
    perm_clientes: !!vinculo.perm_clientes,
    perm_valores: !!vinculo.perm_valores,
    perm_cameras: !!vinculo.perm_cameras,
    perm_catalogo: !!vinculo.perm_catalogo,
  });
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [confirmarAtivo, setConfirmarAtivo] = useState(false);

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      await pb.collection("vinculos").update(vinculo.id, {
        papel,
        responsavel_fila: papel === "funcionario" && respFila,
        ...acessos,
      });
      onSalvo("Alterações salvas.");
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo() {
    setErro("");
    setSalvando(true);
    try {
      await pb.collection("vinculos").update(vinculo.id, { ativo: !vinculo.ativo });
      onSalvo(vinculo.ativo ? `${u?.nome} foi desativado(a) e não acessa mais o app.` : `${u?.nome} foi reativado(a).`);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setConfirmarAtivo(false);
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setTrocandoSenha(true);
    try {
      await pb.send("/api/lr/equipe/senha", { method: "POST", body: { vinculo: vinculo.id, senha } });
      onSalvo(`Senha de ${u?.nome} trocada. Os celulares conectados com a senha antiga saem do app.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setTrocandoSenha(false);
    }
  }

  if (confirmarAtivo) {
    return (
      <Confirmar
        aberto
        titulo={vinculo.ativo ? `Desativar ${u?.nome}?` : `Reativar ${u?.nome}?`}
        texto={vinculo.ativo ? "A pessoa deixa de acessar o app. O histórico dela fica guardado." : "A pessoa volta a acessar o app."}
        rotuloConfirmar={vinculo.ativo ? "Desativar" : "Reativar"}
        perigo={vinculo.ativo}
        carregando={salvando}
        onConfirmar={alternarAtivo}
        onCancelar={() => setConfirmarAtivo(false)}
      />
    );
  }

  return (
    <Folha titulo={u?.nome || "Pessoa"} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        {u?.celular && (
          <Cartao className="flex items-center justify-between gap-3">
            <span className="text-base text-tinta">{mascaraCelular(u.celular)}</span>
            <a href={linkWhatsApp(u.celular)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-xl px-3 font-bold text-[#1f7a45]">
              WhatsApp
            </a>
          </Cartao>
        )}
        <Link
          to={`../equipe/${vinculo.usuario}`}
          relative="path"
          className="flex min-h-12 items-center justify-between rounded-xl border-2 border-linha bg-white px-4 font-bold text-tinta"
        >
          Financeiro: bônus, vales e holerites <span className="text-marca">›</span>
        </Link>
        <EscolhaPapel valor={papel} onChange={setPapel} />
        {papel === "funcionario" && (
          <Interruptor
            rotulo="Responsável pela fila"
            descricao="Pode confirmar, recusar e reorganizar a fila quando o gerente não estiver."
            ligado={respFila}
            onChange={setRespFila}
          />
        )}
        <fieldset className="flex flex-col gap-2 rounded-2xl border-2 border-linha bg-white p-4">
          <legend className="px-1 text-base font-bold text-tinta">Acessos liberados por você</legend>
          <p className="text-sm text-tinta-suave">
            Libere ou tire quando quiser. Equipe, senhas, vales, holerites e configurações continuam só seus.
          </p>
          <Interruptor
            rotulo="Lista de clientes"
            descricao="Quem veio, quantas vezes, celular e quanto gastou."
            ligado={acessos.perm_clientes}
            onChange={(v) => setAcessos((a) => ({ ...a, perm_clientes: v }))}
          />
          <Interruptor
            rotulo="Valores e dashboard"
            descricao={papel === "gerente" ? "O gerente já vê: dashboard, painel do dia, caixa e vendas de todos." : "Dashboard, painel do dia, caixa e vendas de todos."}
            ligado={papel === "gerente" || acessos.perm_valores}
            disabled={papel === "gerente"}
            onChange={(v) => setAcessos((a) => ({ ...a, perm_valores: v }))}
          />
          <Interruptor
            rotulo="Ver câmeras"
            descricao="Só ver ao vivo. Cadastrar e configurar câmeras continua só com você."
            ligado={acessos.perm_cameras}
            onChange={(v) => setAcessos((a) => ({ ...a, perm_cameras: v }))}
          />
          <Interruptor
            rotulo="Serviços, preços e produtos"
            descricao="Mudar preço, tempo médio, estoque e comissão."
            ligado={acessos.perm_catalogo}
            onChange={(v) => setAcessos((a) => ({ ...a, perm_catalogo: v }))}
          />
        </fieldset>
        <Botao largo carregando={salvando} onClick={salvar}>
          Salvar
        </Botao>

        <form onSubmit={trocarSenha} className="mt-2 flex flex-col gap-3 border-t border-linha pt-5" noValidate>
          <Campo rotulo="Nova senha" type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} ajuda="Mínimo de 8 caracteres." />
          <Botao type="submit" variante="secundario" largo carregando={trocandoSenha}>
            Trocar senha
          </Botao>
        </form>

        {erro && <Aviso>{erro}</Aviso>}

        <div className="border-t border-linha pt-5">
          <Botao variante={vinculo.ativo ? "perigo" : "secundario"} largo onClick={() => setConfirmarAtivo(true)}>
            {vinculo.ativo ? "Desativar acesso" : "Reativar acesso"}
          </Botao>
        </div>
      </div>
    </Folha>
  );
}

// Bônus por carro lavado (só o patrão vê e edita).
function CartaoBonus({ empresaId }: { empresaId: string }) {
  const [regra, setRegra] = useState<RegraBonus | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    pb.collection("regras_bonus")
      .getFullList<RegraBonus>({ filter: pb.filter("empresa = {:e}", { e: empresaId }) })
      .then((l) => setRegra(l[0] || null))
      .catch(() => setRegra(null));
  }, [empresaId]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro("");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    if (isNaN(v) || v < 0) return setErro("Valor inválido.");
    setSalvando(true);
    try {
      const dados = { empresa: empresaId, valor_por_carro: Math.round(v * 100) / 100, ativo };
      if (regra) await pb.collection("regras_bonus").update(regra.id, dados);
      else await pb.collection("regras_bonus").create(dados);
      setEditando(false);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  if (regra === undefined) return null;
  return (
    <>
      <button
        onClick={() => {
          setValor(regra ? String(regra.valor_por_carro).replace(".", ",") : "");
          setAtivo(regra ? regra.ativo : true);
          setEditando(true);
        }}
        className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 text-left shadow-sm hover:border-marca"
      >
        <span>
          <span className="block text-lg font-bold text-tinta">Bônus por carro lavado</span>
          <span className="block text-base text-tinta-suave">
            {regra && regra.ativo ? `${reais(regra.valor_por_carro)} por carro` : "Desligado"} · comissão por produto em Produtos
          </span>
        </span>
        <span className="text-2xl text-marca" aria-hidden="true">›</span>
      </button>
      {editando && (
        <Folha titulo="Bônus por carro lavado" onFechar={() => setEditando(false)}>
          <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
            <Campo rotulo="Valor por carro (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} />
            <Interruptor rotulo="Bônus ligado" descricao="Conta para quem foi marcado como 'quem lavou' na baixa do carro." ligado={ativo} onChange={setAtivo} />
            <p className="text-sm text-tinta-suave">Só você vê esta regra. Cada pessoa vê apenas o próprio bônus estimado.</p>
            {erro && <Aviso>{erro}</Aviso>}
            <Botao type="submit" largo carregando={salvando}>
              Salvar
            </Botao>
          </form>
        </Folha>
      )}
    </>
  );
}
