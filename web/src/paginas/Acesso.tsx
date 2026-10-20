import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CamposVeiculo, corpoVeiculo, validarVeiculo, VEICULO_VAZIO } from "../componentes/CamposVeiculo";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { celularValido, mascaraCelular, somenteDigitos } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";

const CHAVE_CELULAR = "lr_ultimo_celular";
function lerUltimoCelular() {
  try {
    return localStorage.getItem(CHAVE_CELULAR) || "";
  } catch {
    return "";
  }
}
function guardarUltimoCelular(c: string) {
  try {
    localStorage.setItem(CHAVE_CELULAR, c);
  } catch {
    // modo privado: só não lembra
  }
}
// Chrome/Android: pede para o gerenciador de senhas do celular salvar o login
// (num app de uma página só o navegador nem sempre percebe o login sozinho).
async function oferecerSalvarSenha(id: string, password: string) {
  try {
    const W = window as unknown as { PasswordCredential?: new (d: { id: string; password: string }) => Credential };
    if (W.PasswordCredential && navigator.credentials?.store) await navigator.credentials.store(new W.PasswordCredential({ id, password }));
  } catch {
    // sem suporte: o navegador ainda pode oferecer pelo formulário
  }
}

export function Entrar() {
  const { empresa } = useEmpresa();
  const { usuario, entrar } = useSessao();
  const navegar = useNavigate();
  // Lembra o último celular usado neste aparelho (só o número, nunca a senha).
  const [celular, setCelular] = useState(() => mascaraCelular(lerUltimoCelular()));
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={`/${empresa.slug}`} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!celularValido(celular)) return setErro("Digite o celular com DDD.");
    if (!senha) return setErro("Digite sua senha.");
    setEnviando(true);
    try {
      await entrar(celular, senha);
      guardarUltimoCelular(somenteDigitos(celular));
      await oferecerSalvarSenha(somenteDigitos(celular), senha);
      navegar(`/${empresa.slug}`, { replace: true });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setErro(status === 400 ? "Celular ou senha incorretos." : mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura>
      <h1 className="text-2xl font-extrabold text-tinta">Entrar</h1>
      <p className="mt-1 text-base text-tinta-suave">Use o celular e a senha do seu cadastro.</p>
      <form onSubmit={enviar} className="mt-6 flex flex-col gap-4" noValidate>
        <Campo
          rotulo="Celular"
          type="tel"
          name="username"
          inputMode="numeric"
          autoComplete="username"
          placeholder="(11) 98765-4321"
          value={celular}
          onChange={(e) => setCelular(mascaraCelular(e.target.value))}
        />
        <div className="relative">
          <Campo
            rotulo="Senha"
            type={verSenha ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="pr-24"
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute right-1 bottom-1 flex min-h-10 items-center rounded-lg px-3 text-sm font-bold text-marca-forte hover:bg-marca-suave"
            aria-pressed={verSenha}
          >
            {verSenha ? "Esconder" : "Mostrar"}
          </button>
        </div>
        <p className="-mt-2 text-sm text-tinta-suave">O app fica conectado neste celular. O celular também oferece salvar a senha.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={enviando}>
          Entrar
        </Botao>
      </form>
      <div className="mt-8 border-t border-linha pt-6 text-center">
        <p className="text-base text-tinta-suave">Primeira vez aqui?</p>
        <Link
          to={`/${empresa.slug}/cadastro`}
          className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-base font-bold text-marca-forte hover:bg-marca-suave"
        >
          Criar meu cadastro
        </Link>
        <p className="mt-4 text-sm text-tinta-suave">
          Esqueceu a senha? Fale com o {empresa.nome}.
        </p>
      </div>
    </Moldura>
  );
}

export function Cadastro() {
  const { empresa } = useEmpresa();
  const { usuario, entrar } = useSessao();
  const navegar = useNavigate();
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [veiculo, setVeiculo] = useState(VEICULO_VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={`/${empresa.slug}`} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const novos: Record<string, string> = {};
    if (nome.trim().length < 2) novos.nome = "Digite seu nome.";
    if (!celularValido(celular)) novos.celular = "Digite o celular com DDD.";
    if (senha.length < 8) novos.senha = "A senha precisa ter pelo menos 8 caracteres.";
    Object.assign(novos, validarVeiculo(veiculo));
    setErros(novos);
    if (Object.keys(novos).length) return;
    setEnviando(true);
    try {
      await pb.send("/api/lr/cadastro", {
        method: "POST",
        body: {
          slug: empresa.slug,
          nome: nome.trim(),
          celular: somenteDigitos(celular),
          senha,
          aceite_marketing: aceite,
          ...corpoVeiculo(veiculo),
        },
      });
      await entrar(celular, senha);
      guardarUltimoCelular(somenteDigitos(celular));
      await oferecerSalvarSenha(somenteDigitos(celular), senha);
      navegar(`/${empresa.slug}`, { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}/entrar`} titulo="Criar cadastro">
      <p className="text-base text-tinta-suave">
        Com o cadastro você acompanha a fila do {empresa.nome} pelo celular.
      </p>
      <form onSubmit={enviar} className="mt-6 flex flex-col gap-4" noValidate>
        <Campo rotulo="Seu nome" autoComplete="name" autoCapitalize="words" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} />
        <Campo
          rotulo="Celular"
          type="tel"
          name="username"
          inputMode="numeric"
          autoComplete="username"
          placeholder="(11) 98765-4321"
          value={celular}
          onChange={(e) => setCelular(mascaraCelular(e.target.value))}
          erro={erros.celular}
          ajuda="É com ele que você vai entrar."
        />
        <div className="relative">
          <Campo
            rotulo="Crie uma senha"
            type={verSenha ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            erro={erros.senha}
            ajuda="Mínimo de 8 caracteres, com letras e números."
            className="pr-24"
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute right-1 top-[2.15rem] flex min-h-10 items-center rounded-lg px-3 text-sm font-bold text-marca-forte hover:bg-marca-suave"
            aria-pressed={verSenha}
          >
            {verSenha ? "Esconder" : "Mostrar"}
          </button>
        </div>
        <h2 className="mt-2 text-lg font-extrabold text-tinta">Seu veículo</h2>
        <CamposVeiculo valor={veiculo} onChange={setVeiculo} erros={erros} />
        <Interruptor
          rotulo="Quero receber promoções"
          descricao="Por WhatsApp ou Instagram. Você pode desligar quando quiser."
          ligado={aceite}
          onChange={setAceite}
        />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={enviando}>
          Criar cadastro
        </Botao>
        <p className="text-center text-sm text-tinta-suave">
          Ao criar o cadastro você concorda com a{" "}
          <Link to={`/${empresa.slug}/privacidade`} className="font-bold text-marca-forte underline">
            política de privacidade
          </Link>
          .
        </p>
      </form>
    </Moldura>
  );
}
