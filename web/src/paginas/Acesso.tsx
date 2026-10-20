import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CamposVeiculo, corpoVeiculo, validarVeiculo, VEICULO_VAZIO } from "../componentes/CamposVeiculo";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { celularValido, mascaraCelular, somenteDigitos } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";

export function Entrar() {
  const { empresa } = useEmpresa();
  const { usuario, entrar } = useSessao();
  const navegar = useNavigate();
  const [celular, setCelular] = useState("");
  const [senha, setSenha] = useState("");
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
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="(11) 98765-4321"
          value={celular}
          onChange={(e) => setCelular(mascaraCelular(e.target.value))}
        />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
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
        <Campo rotulo="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} />
        <Campo
          rotulo="Celular"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="(11) 98765-4321"
          value={celular}
          onChange={(e) => setCelular(mascaraCelular(e.target.value))}
          erro={erros.celular}
          ajuda="É com ele que você vai entrar."
        />
        <Campo
          rotulo="Crie uma senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          erro={erros.senha}
          ajuda="Mínimo de 8 caracteres."
        />
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
