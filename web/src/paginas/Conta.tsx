import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { MeusVeiculos } from "../componentes/MeusVeiculos";
import { Aviso, Botao, Campo, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { mascaraCelular } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { desativarAvisos } from "../lib/push";
import type { Usuario } from "../lib/tipos";

export function Conta() {
  const { empresa, vinculo } = useEmpresa();
  const { usuario, sair, atualizarUsuario, entrar } = useSessao();
  const navegar = useNavigate();
  const [nome, setNome] = useState(usuario?.nome || "");
  const [aceite, setAceite] = useState(!!usuario?.aceite_marketing);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [erroSenha, setErroSenha] = useState("");
  const [trocando, setTrocando] = useState(false);

  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;

  async function salvarDados(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    if (nome.trim().length < 2) return setErro("Digite seu nome.");
    setSalvando(true);
    try {
      const u = await pb.collection("usuarios").update<Usuario>(usuario!.id, { nome: nome.trim(), aceite_marketing: aceite });
      atualizarUsuario(u);
      setMsg("Dados salvos.");
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    setErroSenha("");
    setMsg("");
    if (!senhaAtual) return setErroSenha("Digite a senha atual.");
    if (senhaNova.length < 8) return setErroSenha("A nova senha precisa ter pelo menos 8 caracteres.");
    setTrocando(true);
    try {
      await pb.collection("usuarios").update(usuario!.id, {
        oldPassword: senhaAtual,
        password: senhaNova,
        passwordConfirm: senhaNova,
      });
      // Trocar a senha encerra a sessão; entra de novo com a senha nova.
      await entrar(usuario!.celular, senhaNova);
      setSenhaAtual("");
      setSenhaNova("");
      setMsg("Senha trocada.");
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setErroSenha(status === 400 ? "Senha atual incorreta." : mensagemDeErro(err));
    } finally {
      setTrocando(false);
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Minha conta">
      {msg && (
        <div className="mb-4">
          <Aviso tipo="sucesso">{msg}</Aviso>
        </div>
      )}
      <form onSubmit={salvarDados} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Celular" value={mascaraCelular(usuario.celular)} disabled ajuda="O celular é o seu login e não pode ser trocado aqui." />
        <Interruptor rotulo="Quero receber promoções" descricao="Por WhatsApp ou Instagram." ligado={aceite} onChange={setAceite} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar
        </Botao>
      </form>

      {vinculo?.papel === "cliente" && (
        <div className="mt-8 border-t border-linha pt-6">
          <MeusVeiculos />
        </div>
      )}

      <form onSubmit={trocarSenha} className="mt-8 flex flex-col gap-4 border-t border-linha pt-6" noValidate>
        <h2 className="text-lg font-extrabold text-tinta">Trocar senha</h2>
        <Campo rotulo="Senha atual" type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
        <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} ajuda="Mínimo de 8 caracteres." />
        {erroSenha && <Aviso>{erroSenha}</Aviso>}
        <Botao type="submit" variante="secundario" largo carregando={trocando}>
          Trocar senha
        </Botao>
      </form>

      <div className="mt-8 border-t border-linha pt-6">
        <Botao
          variante="secundario"
          largo
          onClick={async () => {
            await desativarAvisos();
            sair();
            navegar(`/${empresa.slug}/entrar`, { replace: true });
          }}
        >
          Sair do app
        </Botao>
        <Link to={`/${empresa.slug}/privacidade`} className="mt-2 text-center text-base font-bold text-marca-forte underline">
          Política de privacidade
        </Link>
      </div>
    </Moldura>
  );
}
