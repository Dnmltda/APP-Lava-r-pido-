import { Link, Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Cartao } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { FilaCliente } from "./FilaCliente";
import { DIAS_SEMANA, linkWhatsApp, primeiroNome } from "../lib/formato";
import { pode } from "../lib/permissoes";
import { NOME_PAPEL, type Empresa } from "../lib/tipos";

export function Painel() {
  const { empresa, vinculo, erroVinculo } = useEmpresa();
  const { usuario, sair } = useSessao();

  if (!usuario) return <Navigate to={`/${empresa.slug}/entrar`} replace />;

  if (!vinculo) {
    return (
      <Moldura>
        <Aviso>{erroVinculo || "Não foi possível abrir este lava rápido."}</Aviso>
        <Botao variante="secundario" largo className="mt-4" onClick={sair}>
          Sair
        </Botao>
      </Moldura>
    );
  }

  const ehEquipe = vinculo.papel !== "cliente";

  return (
    <Moldura>
      <p className="text-base text-tinta-suave">Olá,</p>
      <h1 className="text-2xl font-extrabold text-tinta">{primeiroNome(usuario.nome)}</h1>
      {ehEquipe && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip>{NOME_PAPEL[vinculo.papel]}</Chip>
          {vinculo.papel === "funcionario" && vinculo.responsavel_fila && <Chip>Responsável pela fila</Chip>}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {ehEquipe ? (
          <>
            <Atalho para={`/${empresa.slug}/fila`} titulo="Fila" texto="Confirmar, avisar, lavar e dar baixa" destaque />
            <Atalho
              para={`/${empresa.slug}/vendas`}
              titulo="Vendas"
              texto={pode(vinculo, "ver_valores") ? "Registrar e ver as vendas do dia" : "Registrar e ver as minhas vendas"}
            />
            {pode(vinculo, "ver_valores") && (
              <Atalho titulo="Painel do dia" texto="Metas, caixa e ranking. Na próxima etapa." desativado />
            )}
            {pode(vinculo, "gerenciar_equipe") && (
              <Atalho para={`/${empresa.slug}/equipe`} titulo="Equipe" texto="Cadastrar, permissões, senhas" />
            )}
            {pode(vinculo, "configurar_empresa") && (
              <Atalho para={`/${empresa.slug}/servicos`} titulo="Serviços" texto="Preços e tempo médio de cada serviço" />
            )}
            {pode(vinculo, "configurar_empresa") && (
              <Atalho para={`/${empresa.slug}/produtos`} titulo="Produtos" texto="Preço, estoque e comissão" />
            )}
            {pode(vinculo, "configurar_empresa") && (
              <Atalho para={`/${empresa.slug}/configuracoes`} titulo="Configurações" texto="Logo, cor, fila, avisos e horários" />
            )}
          </>
        ) : (
          <>
            <FilaCliente />
            <InfoEmpresa empresa={empresa} />
          </>
        )}
        <Atalho para={`/${empresa.slug}/conta`} titulo="Minha conta" texto="Nome, senha, promoções" />
      </div>
    </Moldura>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full bg-marca-suave px-3 text-sm font-bold text-marca-forte">
      {children}
    </span>
  );
}

function Atalho({
  para,
  titulo,
  texto,
  desativado,
  destaque,
}: {
  para?: string;
  titulo: string;
  texto: string;
  desativado?: boolean;
  destaque?: boolean;
}) {
  const conteudo = (
    <>
      <span className="min-w-0">
        <span className="block text-lg font-bold text-tinta">{titulo}</span>
        <span className="block text-base text-tinta-suave">{texto}</span>
      </span>
      {!desativado && <span className="text-2xl text-marca" aria-hidden="true">›</span>}
    </>
  );
  const classe = `flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm ${destaque ? "border-2 border-marca bg-marca-suave" : "border-linha bg-white"}`;
  if (desativado || !para) return <div className={`${classe} opacity-60`}>{conteudo}</div>;
  return (
    <Link to={para} className={`${classe} hover:border-marca`}>
      {conteudo}
    </Link>
  );
}

function InfoEmpresa({ empresa }: { empresa: Empresa }) {
  const hoje = empresa.horario_funcionamento?.[new Date().getDay()];
  return (
    <Cartao>
      <p className="text-lg font-bold text-tinta">{empresa.nome}</p>
      {hoje && (
        <p className="mt-1 text-base text-tinta">
          {DIAS_SEMANA[new Date().getDay()]}: {hoje.aberto ? `${hoje.abre} às ${hoje.fecha}` : "fechado"}
        </p>
      )}
      {empresa.endereco && (
        <a
          className="mt-1 block text-base text-marca-forte underline"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(empresa.endereco)}`}
          target="_blank"
          rel="noreferrer"
        >
          {empresa.endereco}
        </a>
      )}
      {empresa.whatsapp && (
        <a
          href={linkWhatsApp(empresa.whatsapp)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-5 text-base font-bold text-white"
        >
          Chamar no WhatsApp
        </a>
      )}
    </Cartao>
  );
}
