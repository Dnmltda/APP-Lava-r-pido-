import { KeyRound, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { entrarComContaSalva, esquecerConta, lembrarConta, listarContas, mudarSenhaSalva, type ContaSalva } from "../lib/contas";
import { mascaraCelular } from "../lib/formato";
import { desativarAvisos } from "../lib/push";
import { Aviso, Botao, Girador, Interruptor } from "./ui";

/** Lista das contas que vivem neste celular (mudam quando alguém entra, sai ou tira uma conta). */
export function useContasSalvas() {
  const [contas, setContas] = useState<ContaSalva[]>(() => listarContas());
  useEffect(() => {
    const atualizar = () => setContas(listarContas());
    window.addEventListener("lr-contas", atualizar);
    window.addEventListener("storage", atualizar);
    return () => {
      window.removeEventListener("lr-contas", atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, []);
  return contas;
}

// Na tela de entrar: "Entrar como…". Com senha salva entra num toque; sem senha, preenche o celular
// e o app pede só a senha.
export function ContasSalvas({ onEntrou, onEscolher }: { onEntrou: () => void; onEscolher: (celular: string) => void }) {
  const contas = useContasSalvas();
  const [entrando, setEntrando] = useState("");
  const [aviso, setAviso] = useState("");
  if (!contas.length) return null;

  async function escolher(c: ContaSalva) {
    setAviso("");
    if (!c.token) return onEscolher(c.celular);
    setEntrando(c.id);
    const ok = await entrarComContaSalva(c);
    setEntrando("");
    if (ok) return onEntrou();
    setAviso(`O acesso salvo de ${c.nome.split(" ")[0]} venceu ou a senha mudou. Digite a senha.`);
    onEscolher(c.celular);
  }

  return (
    <section aria-labelledby="titulo-contas" className="mb-5">
      <h2 id="titulo-contas" className="text-base font-bold text-tinta">
        Entrar como
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {contas.map((c) => (
          <li key={c.id} className="flex items-stretch gap-1 rounded-2xl border border-linha bg-white">
            <button
              type="button"
              onClick={() => escolher(c)}
              disabled={!!entrando}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-fundo disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-suave text-marca-forte">
                {entrando === c.id ? <Girador className="h-5 w-5" /> : <UserRound className="h-5 w-5" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-tinta">{c.nome}</span>
                <span className="flex items-center gap-1 text-sm text-tinta-suave">
                  {mascaraCelular(c.celular)} · {c.token ? (<><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> senha salva</>) : "pede a senha"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => esquecerConta(c.id)}
              aria-label={`Esquecer ${c.nome}`}
              title="Esquecer esta conta neste aparelho"
              className="flex w-12 shrink-0 items-center justify-center rounded-2xl text-tinta-suave hover:bg-fundo"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {aviso && (
        <div className="mt-2">
          <Aviso tipo="info">{aviso}</Aviso>
        </div>
      )}
      <p className="mt-3 text-sm text-tinta-suave">Outra pessoa? Use o formulário abaixo.</p>
    </section>
  );
}

// Em "Minha conta": salvar a senha desta conta, trocar para outra conta do celular ou entrar com outra.
export function ContasNoCelular() {
  const { usuario, sair } = useSessao();
  const { empresa } = useEmpresa();
  const navegar = useNavigate();
  const contas = useContasSalvas();
  const [trocando, setTrocando] = useState("");
  if (!usuario) return null;
  const minha = contas.find((c) => c.id === usuario.id);
  const outras = contas.filter((c) => c.id !== usuario.id);

  async function trocar(c?: ContaSalva) {
    setTrocando(c?.id || "outra");
    await desativarAvisos().catch(() => {});
    sair();
    if (c && (await entrarComContaSalva(c))) {
      setTrocando("");
      return navegar(`/${empresa.slug}`, { replace: true });
    }
    setTrocando("");
    navegar(`/${empresa.slug}/entrar`, { replace: true, state: c ? { celular: c.celular } : null });
  }

  return (
    <section className="mt-8 border-t border-linha pt-6" aria-labelledby="titulo-contas-celular">
      <h2 id="titulo-contas-celular" className="text-lg font-extrabold text-tinta">
        Contas neste celular
      </h2>
      <p className="mt-1 text-sm text-tinta-suave">Emprestou o celular? A outra pessoa entra na conta dela e depois você volta para a sua num toque.</p>
      <div className="mt-3">
        <Interruptor
          rotulo="Salvar a minha senha neste celular"
          descricao={minha?.token ? "Para entrar de novo, é só tocar no seu nome." : "O app vai pedir a sua senha quando você sair e entrar de novo."}
          ligado={!!minha?.token}
          onChange={(v) => {
            if (!minha) lembrarConta(usuario, v);
            else mudarSenhaSalva(usuario.id, v);
          }}
        />
      </div>
      {outras.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {outras.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-2xl border border-linha bg-white px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-tinta">{c.nome}</span>
                <span className="block text-sm text-tinta-suave">
                  {mascaraCelular(c.celular)} · {c.token ? "senha salva" : "pede a senha"}
                </span>
              </span>
              <Botao variante="secundario" carregando={trocando === c.id} disabled={!!trocando} onClick={() => trocar(c)}>
                Entrar
              </Botao>
              <button
                type="button"
                onClick={() => esquecerConta(c.id)}
                aria-label={`Esquecer ${c.nome}`}
                className="flex h-12 w-10 items-center justify-center rounded-xl text-tinta-suave hover:bg-fundo"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Botao variante="secundario" largo className="mt-3" carregando={trocando === "outra"} disabled={!!trocando} onClick={() => trocar()}>
        Entrar com outra conta
      </Botao>
    </section>
  );
}
