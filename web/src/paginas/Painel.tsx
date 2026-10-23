import { Bolhas, CenaLavagem } from "../componentes/Marca";
import { useContagem } from "../lib/animacao";
import { Car, CarFront, Cctv, ChartColumn, ChevronRight, CircleUserRound, Contact, FileText, Gauge, Gift, HeartHandshake, History, ListOrdered, Package, QrCode, Receipt, Settings, ShoppingBag, Sparkles, Star, Tv, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Cartao } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { FilaCliente } from "./FilaCliente";
import { useCatalogo } from "../componentes/Vitrine";
import { tempoDeCliente, useHistorico, vezes } from "./Historico";
import { DIAS_SEMANA, linkWhatsApp, primeiroNome, reais } from "../lib/formato";
import { useFilaAoVivo } from "../lib/fila";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { NOME_PAPEL, type DadosPainel, type Empresa } from "../lib/tipos";

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
  const s = empresa.slug;
  const valores = pode(vinculo, "ver_valores");
  const patrao = pode(vinculo, "configurar_empresa");

  return (
    <Moldura>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base text-tinta-suave">{saudacao()},</p>
          <h1 className="truncate text-2xl font-extrabold text-tinta">{primeiroNome(usuario.nome)}</h1>
        </div>
        {ehEquipe && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Chip>{NOME_PAPEL[vinculo.papel]}</Chip>
            {vinculo.papel === "funcionario" && vinculo.responsavel_fila && <Chip>Resp. fila</Chip>}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {ehEquipe ? (
          <>
            {/* A fila sempre em destaque */}
            <FilaAgora />
            {valores && <HojeResumo />}
            {pode(vinculo, "catalogo") && <FaltaCadastrar />}
            {vinculo.papel === "patrao" && <AppParaAprovar />}

            {/* Atalhos em blocos: o dono acha rápido o que precisa */}
            <Grupo titulo="Dia a dia">
              <Atalho para={`/${s}/vendas`} icone={ShoppingBag} titulo="Vendas" texto={valores ? "Registrar e ver as vendas" : "Registrar e ver as minhas"} />
              {valores && <Atalho para={`/${s}/painel`} icone={Gauge} titulo="Painel do dia" texto="Metas, estoque e atrasos" />}
              {valores && <Atalho para={`/${s}/fechamento`} icone={Receipt} titulo="Fechamento do dia" texto="Maquininhas, dinheiro e notas" />}
              {pode(vinculo, "gerenciar_fila") && <Atalho para={`/${s}/tv`} icone={Tv} titulo="Modo TV" texto="Fila em tela grande na recepção" />}
              <Atalho para={`/${s}/avaliacoes`} icone={Star} titulo="Avaliações" texto="O que os clientes acharam" />
              {vinculo.papel !== "patrao" && <Atalho para={`/${s}/minha-area`} icone={UserRound} titulo="Minha área" texto="Carros, bônus e vales" />}
            </Grupo>
            {valores && (
              <Grupo titulo="Dinheiro">
                <Atalho para={`/${s}/dashboard`} icone={ChartColumn} titulo="Dashboard" texto="Gráficos e relatórios" />
                <Atalho para={`/${s}/caixa`} icone={Wallet} titulo="Caixa" texto="Gastos fixos e fechamento do mês" />
              </Grupo>
            )}
            {((vinculo.papel === "patrao" || vinculo.papel === "gerente") || pode(vinculo, "clientes")) && (
              <Grupo titulo="Clientes">
                {pode(vinculo, "clientes") && <Atalho para={`/${s}/clientes`} icone={Contact} titulo="Clientes" texto="Quem veio, quantas vezes e quanto gastou" />}
                {patrao && <Atalho para={`/${s}/planos`} icone={Gift} titulo="Planos e fidelidade" texto="Pacotes, pedidos e cartão fidelidade" />}
                {(vinculo.papel === "patrao" || vinculo.papel === "gerente") && <Atalho para={`/${s}/orcamentos`} icone={FileText} titulo="Orçamentos" texto="Polimento e serviços sob orçamento" />}
                {(vinculo.papel === "patrao" || vinculo.papel === "gerente") && <Atalho para={`/${s}/reativar`} icone={HeartHandshake} titulo="Reativar clientes" texto="Quem não volta há 30 dias" />}
              </Grupo>
            )}
            <Grupo titulo="Cadastros e conta">
              {pode(vinculo, "gerenciar_equipe") && <Atalho para={`/${s}/equipe`} icone={Users} titulo="Equipe" texto="Pessoas, permissões, senhas" />}
              {pode(vinculo, "catalogo") && <Atalho para={`/${s}/servicos`} icone={Sparkles} titulo="Serviços" texto="Preço e tempo médio" />}
              {patrao && <Atalho para={`/${s}/tamanhos`} icone={CarFront} titulo="Tamanho dos carros" texto="Carro, moto, caminhão ou transporte" />}
              {pode(vinculo, "catalogo") && <Atalho para={`/${s}/produtos`} icone={Package} titulo="Produtos" texto="Preço, estoque, comissão" />}
              {pode(vinculo, "cameras") && <Atalho para={`/${s}/cameras`} icone={Cctv} titulo="Câmeras" texto="Boxes ao vivo e sensor" />}
              {patrao && <Atalho para={`/${s}/cartaz`} icone={QrCode} titulo="Cartaz do balcão" texto="QR Code para os clientes" />}
              {patrao && <Atalho para={`/${s}/configuracoes`} icone={Settings} titulo="Configurações" texto="Logo, fila, horários" />}
              <Atalho para={`/${s}/conta`} icone={CircleUserRound} titulo="Minha conta" texto="Nome, senha, sair" />
            </Grupo>
          </>
        ) : (
          <>
            <CenaLavagem titulo={empresa.nome} texto="Entre na fila, reserve horário e acompanhe o seu carro." />
            <FilaCliente />
            <ResumoCliente />
            <InfoEmpresa empresa={empresa} />
            <Link
              to={`/${s}/conta`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 shadow-sm hover:border-marca"
            >
              <span className="flex items-center gap-3">
                <CircleUserRound className="h-6 w-6 text-marca-forte" aria-hidden="true" />
                <span className="text-base font-bold text-tinta">Minha conta</span>
              </span>
              <ChevronRight className="h-5 w-5 text-tinta-suave" aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </Moldura>
  );
}

// Cliente: quantas vezes já veio e desde quando (abre o histórico completo).
function ResumoCliente() {
  const { empresa } = useEmpresa();
  const { dados } = useHistorico(empresa.slug);
  return (
    <Link
      to={`/${empresa.slug}/historico`}
      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 shadow-sm hover:border-marca"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-marca-suave text-marca-forte">
          <History className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-extrabold text-tinta">Meu histórico</span>
          <span className="block text-sm text-tinta-suave">
            {dados
              ? dados.total_visitas
                ? `${vezes(dados.total_visitas)} aqui · cliente ${tempoDeCliente(dados.cliente_desde)}`
                : `Cliente ${tempoDeCliente(dados.cliente_desde)} · serviços e produtos de cada visita`
              : "Quantas vezes você veio e o que fez"}
          </span>
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-tinta-suave" aria-hidden="true" />
    </Link>
  );
}

function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// Cartão grande da fila ao vivo para a equipe: números do momento + próximo carro.
function FilaAgora() {
  const { empresa, vinculo } = useEmpresa();
  const { publica, erro } = useFilaAoVivo(empresa.slug, empresa.id);
  const pendentes = publica?.fila.filter((i) => i.status === "pendente").length ?? 0;
  const naFila = publica ? publica.fila.length - pendentes : 0;
  const proximo = publica?.fila.find((i) => i.status !== "pendente");
  const gestao = pode(vinculo, "gerenciar_fila");
  return (
    <Link
      to={`/${empresa.slug}/fila`}
      className="cabecalho-dnm relative block overflow-hidden rounded-3xl p-5 shadow-lg transition-transform active:scale-[0.99]"
      aria-label="Abrir a fila"
    >
      <Bolhas />
      <div className="relative flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-lg font-extrabold">
          <ListOrdered className="h-6 w-6" aria-hidden="true" /> Fila agora
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold opacity-90">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" aria-hidden="true" /> ao vivo
        </span>
      </div>
      {!publica ? (
        <p className="relative mt-4 text-base opacity-90">{erro || "Carregando…"}</p>
      ) : (
        <div className="relative">
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <Numero valor={pendentes} rotulo="a confirmar" alerta={gestao && pendentes > 0} />
            <Numero valor={naFila} rotulo="na fila" />
            <Numero valor={publica.lavando.length} rotulo="lavando" />
            <Numero valor={publica.prontos.length} rotulo="prontos" />
          </div>
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-black/15 px-3 py-2 text-base">
            <Car className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {proximo ? (
                <>
                  Próximo: <strong>{proximo.nome}</strong> · …{proximo.final_placa} · {proximo.servico}
                </>
              ) : (
                "Ninguém esperando agora"
              )}
            </span>
          </p>
          <span className="mt-4 flex min-h-12 items-center justify-center gap-1 rounded-xl bg-dourado text-base font-extrabold text-marinho">
            Abrir a fila <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
      )}
    </Link>
  );
}

function Numero({ valor, rotulo, alerta }: { valor: number; rotulo: string; alerta?: boolean }) {
  const contado = Math.round(useContagem(valor));
  return (
    <div className={`rounded-2xl px-1 py-2 ${alerta ? "bg-white text-tinta" : "bg-white/10"}`}>
      <p className="text-3xl font-black leading-none">{contado}</p>
      <p className="mt-1 text-xs font-semibold leading-tight opacity-90">{rotulo}</p>
    </div>
  );
}

// Patrão e gerente: o dia em dois números, com atalho para o dashboard.
function HojeResumo() {
  const { empresa } = useEmpresa();
  const [dados, setDados] = useState<DadosPainel | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      pb
        .send<DadosPainel>(`/api/lr/painel/${empresa.id}`, { method: "GET" })
        .then((d) => vivo && setDados(d))
        .catch(() => {});
    carregar();
    const t = window.setInterval(carregar, 60_000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [empresa.id]);
  const metaDia = dados?.metas.dia || 0;
  const faturamento = useContagem(dados?.faturamento.total || 0);
  const lavados = Math.round(useContagem(dados?.carros_lavados || 0));
  return (
    <Link to={`/${empresa.slug}/dashboard`} className="block rounded-3xl border border-linha bg-white p-4 shadow-sm hover:border-marca">
      <div className="flex items-center justify-between">
        <span className="text-base font-extrabold text-tinta">Hoje</span>
        <span className="flex items-center text-sm font-bold text-marca-forte">
          Dashboard <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm text-tinta-suave">Faturamento</p>
          <p className="text-2xl font-extrabold text-tinta">{dados ? reais(faturamento) : "—"}</p>
        </div>
        <div>
          <p className="text-sm text-tinta-suave">Carros lavados</p>
          <p className="text-2xl font-extrabold text-tinta">{dados ? lavados : "—"}</p>
        </div>
      </div>
      {dados && metaDia > 0 && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-marca-suave" role="progressbar" aria-label="Meta do dia" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((dados.metas.realizado_dia / metaDia) * 100))}>
            <div className="crescer-x h-full rounded-full bg-linear-to-r from-dourado-escuro to-dourado" style={{ width: `${Math.min(100, (dados.metas.realizado_dia / metaDia) * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm text-tinta-suave">
            {Math.round((dados.metas.realizado_dia / metaDia) * 100)}% da meta do dia ({reais(metaDia)})
          </p>
        </div>
      )}
    </Link>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full bg-marca-suave px-3 text-sm font-bold text-marca-forte">
      {children}
    </span>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo}>
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta-suave">{titulo}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

export function Atalho({ para, titulo, texto, icone: Icone }: { para: string; titulo: string; texto: string; icone: LucideIcon }) {
  return (
    <Link
      to={para}
      className="flex min-h-28 flex-col gap-3 rounded-2xl border border-linha bg-white p-4 shadow-sm transition-colors hover:border-marca active:bg-marca-suave"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca-suave text-marca-forte">
        <Icone className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-extrabold leading-tight text-tinta">{titulo}</span>
        <span className="mt-0.5 block text-sm leading-snug text-tinta-suave">{texto}</span>
      </span>
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

// Lembrete para quem cuida do catálogo: sem serviço o cliente não entra na fila; sem produto não há vitrine.
function FaltaCadastrar() {
  const { empresa } = useEmpresa();
  const catalogo = useCatalogo(empresa.slug);
  const [semServico, setSemServico] = useState(false);
  useEffect(() => {
    pb.collection("servicos")
      .getList(1, 1, { filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), fields: "id" })
      .then((r) => setSemServico(r.totalItems === 0))
      .catch(() => {});
  }, [empresa.id]);
  const semProduto = catalogo !== null && catalogo.length === 0;
  if (!semServico && !semProduto) return null;
  return (
    <div className="flex flex-col gap-2">
      {semServico && (
        <Link to={`/${empresa.slug}/servicos`} className="block rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <span className="block text-base font-extrabold text-tinta">Nenhum serviço disponível</span>
          <span className="block text-sm text-tinta">Os clientes não conseguem entrar na fila. Toque para cadastrar (tem tabela pronta).</span>
        </Link>
      )}
      {semProduto && (
        <Link to={`/${empresa.slug}/produtos`} className="block rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <span className="block text-base font-extrabold text-tinta">Nenhum produto à venda</span>
          <span className="block text-sm text-tinta">Os clientes não veem a vitrine (cheirinho, pretinho…). Toque para cadastrar.</span>
        </Link>
      )}
    </div>
  );
}

// Dono: carros que a equipe conferiu como motorista de app na fila. Aprovando, o desconto entra
// sozinho nas próximas vezes (só este carro, só neste lava rápido). Recusando, vale o tamanho.
interface PendenteApp {
  veiculo: string;
  cliente: string;
  celular: string;
  placa: string;
  modelo: string;
  cor: string;
  ultima: string;
  vezes: number;
}
function AppParaAprovar() {
  const { empresa } = useEmpresa();
  const [lista, setLista] = useState<PendenteApp[]>([]);
  const [nomeTipo, setNomeTipo] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const carregar = () =>
    pb
      .send<{ tipo?: string; pendentes: PendenteApp[] }>(`/api/lr/app-pendentes/${empresa.id}`, { method: "GET" })
      .then((r) => {
        setLista(r.pendentes);
        setNomeTipo(r.tipo || "");
      })
      .catch(() => {});
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa.id]);
  async function decidir(p: PendenteApp, aprovar: boolean) {
    setOcupado(p.veiculo);
    setErro("");
    try {
      await pb.send("/api/lr/app-aprovar", { method: "POST", body: { empresa: empresa.id, veiculo: p.veiculo, aprovar } });
      await carregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setOcupado("");
    }
  }
  if (!lista.length) return null;
  return (
    <section aria-labelledby="titulo-app" className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-4">
      <h2 id="titulo-app" className="text-lg font-extrabold text-tinta">
        Motorista de app para aprovar ({lista.length})
      </h2>
      <p className="mt-1 text-sm text-tinta">
        A equipe conferiu na fila e deu o desconto de “{nomeTipo}” uma vez. Aprovando, o desconto entra sozinho nas próximas vezes, só para este carro.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {lista.map((p) => (
          <li key={p.veiculo} className="rounded-2xl bg-white p-3">
            <p className="text-base font-bold text-tinta">
              {p.cliente} · <span className="font-mono">{p.placa}</span>
            </p>
            <p className="text-sm text-tinta-suave">
              {[p.modelo, p.cor].filter(Boolean).join(" · ")} · {p.vezes} {p.vezes === 1 ? "vez" : "vezes"} com desconto
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Botao carregando={ocupado === p.veiculo} onClick={() => decidir(p, true)}>
                Aprovar
              </Botao>
              <Botao variante="secundario" disabled={ocupado === p.veiculo} onClick={() => decidir(p, false)}>
                Recusar
              </Botao>
            </div>
          </li>
        ))}
      </ul>
      {erro && <Aviso>{erro}</Aviso>}
    </section>
  );
}
