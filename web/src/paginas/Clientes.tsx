import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { EscolhaTipo, tiposDaEmpresa } from "../componentes/TipoVeiculo";
import { Aviso, Carregando, EstadoErro, EstadoVazio, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { linkWhatsApp, mascaraCelular, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { textoPorte } from "../lib/porteVeiculo";
import { tempoDeCliente, vezes, type DadosHistorico } from "./Historico";

// Lista de clientes: só o dono, ou quem o dono liberar em Equipe → "Lista de clientes".

interface ClienteLista {
  usuario: string;
  nome: string;
  celular: string;
  aceita_promocoes: boolean;
  ativo: boolean;
  cliente_desde: string;
  visitas: number;
  ultima_visita: string;
  gasto_total: number;
}

interface VeiculoCliente {
  id: string;
  placa: string;
  final_placa: string;
  modelo: string;
  cor: string;
  porte: string;
  app_motorista: boolean;
  cobrar_como: string;
}

interface DetalheCliente extends DadosHistorico {
  nome: string;
  celular: string;
  aceita_promocoes: boolean;
  email?: string;
  rede_social?: string;
  veiculos: VeiculoCliente[];
  gasto: { servicos: number; produtos: number; total: number };
  visitas: (DadosHistorico["visitas"][number] & { valor?: number })[];
}

type Ordem = "recentes" | "visitas" | "gasto" | "nome";
const ORDEM: Record<Ordem, string> = { recentes: "Mais recentes", visitas: "Mais visitas", gasto: "Mais gasto", nome: "Nome" };
const FMT_DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const dataDe = (s: string) => new Date(s.replace(" ", "T"));
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Clientes() {
  const { empresa, vinculo } = useEmpresa();
  const [lista, setLista] = useState<ClienteLista[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [aberto, setAberto] = useState<ClienteLista | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await pb.send<{ clientes: ClienteLista[] }>(`/api/lr/clientes/${empresa.id}`, { method: "GET" });
      setLista(r.clientes);
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrada = useMemo(() => {
    if (!lista) return [];
    const b = semAcento(busca.trim());
    const dig = busca.replace(/\D/g, "");
    const l = lista.filter((c) => !b || semAcento(c.nome).includes(b) || (dig.length >= 3 && c.celular.includes(dig)));
    const por: Record<Ordem, (a: ClienteLista, b: ClienteLista) => number> = {
      recentes: (a, b) => (b.ultima_visita || "").localeCompare(a.ultima_visita || "") || b.visitas - a.visitas,
      visitas: (a, b) => b.visitas - a.visitas || b.gasto_total - a.gasto_total,
      gasto: (a, b) => b.gasto_total - a.gasto_total,
      nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
    };
    return [...l].sort(por[ordem]);
  }, [lista, busca, ordem]);

  if (!pode(vinculo, "clientes")) return <Navigate to={`/${empresa.slug}`} replace />;

  const totalVisitas = lista?.reduce((s, c) => s + c.visitas, 0) || 0;
  const voltaram = lista?.filter((c) => c.visitas >= 2).length || 0;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Clientes">
      {erro && !lista ? (
        <EstadoErro texto={erro} tentar={carregar} />
      ) : !lista ? (
        <Carregando />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Mini rotulo="Clientes" valor={String(lista.length)} />
            <Mini rotulo="Lavagens" valor={String(totalVisitas)} />
            <Mini rotulo="Voltaram 2+" valor={String(voltaram)} />
          </div>

          <label className="relative block">
            <span className="sr-only">Buscar cliente</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou celular"
              className="min-h-12 w-full rounded-xl border-2 border-linha bg-white pl-10 pr-4 text-base text-tinta placeholder:text-tinta-suave/70 focus:border-marca focus:outline-none"
            />
          </label>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Ordenar">
            {(Object.keys(ORDEM) as Ordem[]).map((o) => (
              <button
                key={o}
                role="tab"
                aria-selected={ordem === o}
                onClick={() => setOrdem(o)}
                className={`min-h-10 shrink-0 rounded-full border-2 px-3 text-sm font-bold ${ordem === o ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
              >
                {ORDEM[o]}
              </button>
            ))}
          </div>

          {filtrada.length === 0 ? (
            <EstadoVazio
              titulo={lista.length ? "Ninguém encontrado" : "Nenhum cliente ainda"}
              texto={lista.length ? "Confira o nome ou os números do celular." : "Os clientes aparecem aqui quando se cadastram pelo link ou pelo QR Code do balcão."}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {filtrada.map((c) => (
                <li key={c.usuario}>
                  <button
                    onClick={() => setAberto(c)}
                    className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-linha bg-white px-4 py-3 text-left shadow-sm hover:border-marca ${c.ativo ? "" : "opacity-60"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-bold text-tinta">{c.nome}</span>
                      <span className="block text-sm text-tinta-suave">
                        {c.ultima_visita ? `última vez em ${FMT_DATA.format(dataDe(c.ultima_visita))}` : "ainda não lavou"} · cliente {tempoDeCliente(c.cliente_desde)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-extrabold text-tinta">{vezes(c.visitas)}</span>
                      <span className="block text-sm text-tinta-suave">{reais(c.gasto_total)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {aberto && <Detalhe empresaId={empresa.id} cliente={aberto} onFechar={() => setAberto(null)} />}
    </Moldura>
  );
}

// Carro do cliente: tamanho pelo modelo e, para dono/gerente, "cobrar como" (privilégio do cliente).
function CobrarComo({ empresaId, veiculo }: { empresaId: string; veiculo: VeiculoCliente }) {
  const { empresa, vinculo } = useEmpresa();
  const tipos = tiposDaEmpresa(empresa);
  const [tipo, setTipo] = useState(veiculo.cobrar_como === "recusado" ? "" : veiculo.cobrar_como);
  const [salvo, setSalvo] = useState(tipo);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const pode = vinculo?.papel === "patrao" || vinculo?.papel === "gerente";
  const opcoes = tipos.filter((t) => vinculo?.papel === "patrao" || t.vale !== "app" || t.id === salvo);
  async function salvar(novo: string) {
    setTipo(novo);
    setErro("");
    setSalvando(true);
    try {
      await pb.send("/api/lr/cliente-tipo", { method: "POST", body: { empresa: empresaId, veiculo: veiculo.id, tipo: novo } });
      setSalvo(novo);
    } catch (err) {
      setTipo(salvo);
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }
  const nomeSalvo = tipos.find((t) => t.id === salvo)?.nome;
  return (
    <div className="rounded-2xl border border-linha bg-white p-3">
      <p className="text-base font-bold text-tinta">{[veiculo.modelo, veiculo.cor, veiculo.placa || `…${veiculo.final_placa}`].filter(Boolean).join(" · ")}</p>
      <p className="text-sm text-tinta-suave">
        {veiculo.porte ? `${textoPorte(veiculo.porte)} (pelo modelo)` : "Modelo fora da lista: tamanho a definir"}
        {veiculo.app_motorista ? " · diz ser motorista de app" : ""}
        {nomeSalvo ? ` · cobrando como ${nomeSalvo}` : ""}
      </p>
      {pode && tipos.length > 0 && (
        <div className="mt-2">
          <EscolhaTipo tipos={opcoes} valor={tipo} onChange={salvar} rotulo="Cobrar como" semTipo="Pelo tamanho" />
          {salvando && <p className="mt-1 text-sm text-tinta-suave">Salvando…</p>}
          {erro && <Aviso>{erro}</Aviso>}
        </div>
      )}
    </div>
  );
}

function Detalhe({ empresaId, cliente, onFechar }: { empresaId: string; cliente: ClienteLista; onFechar: () => void }) {
  const [d, setD] = useState<DetalheCliente | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    pb.send<DetalheCliente>(`/api/lr/clientes/${empresaId}/${cliente.usuario}`, { method: "GET" })
      .then(setD)
      .catch((err) => setErro(mensagemDeErro(err)));
  }, [empresaId, cliente.usuario]);

  return (
    <Folha titulo={cliente.nome} onFechar={onFechar}>
      {erro ? (
        <EstadoErro texto={erro} />
      ) : !d ? (
        <Carregando />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-linha bg-white p-3">
            <span className="text-base text-tinta">
              {mascaraCelular(d.celular)}
              {d.aceita_promocoes && <span className="block text-sm text-tinta-suave">aceita receber promoções</span>}
            </span>
            <a href={linkWhatsApp(d.celular)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-xl px-3 font-bold text-[#1f7a45]">
              WhatsApp
            </a>
          </div>
          {(d.email || d.rede_social) && (
            <div className="rounded-2xl border border-linha bg-white p-3 text-base text-tinta">
              {d.email && (
                <a href={`mailto:${d.email}`} className="block break-all font-semibold text-marca-forte underline">
                  {d.email}
                </a>
              )}
              {d.rede_social && <span className="block break-all">Rede social: {d.rede_social}</span>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Mini rotulo="Visitas" valor={vezes(d.total_visitas)} />
            <Mini rotulo="Gasto total" valor={reais(d.gasto.total)} />
            <Mini rotulo="Serviços" valor={reais(d.gasto.servicos)} />
            <Mini rotulo="Produtos" valor={reais(d.gasto.produtos)} />
          </div>
          <p className="text-sm text-tinta-suave">
            Cliente {tempoDeCliente(d.cliente_desde)}
          </p>
          {d.veiculos.map((v) => (
            <CobrarComo key={v.id} empresaId={empresaId} veiculo={v} />
          ))}
          {d.por_servico.length > 0 && (
            <section>
              <h3 className="mb-1 text-base font-extrabold text-tinta">Serviços</h3>
              <ul className="divide-y divide-linha rounded-xl border border-linha bg-white px-3">
                {d.por_servico.map((s) => (
                  <li key={s.nome} className="flex justify-between gap-3 py-2 text-base">
                    <span className="text-tinta">{s.nome}</span>
                    <strong className="text-tinta">{vezes(s.vezes)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {d.produtos.length > 0 && (
            <section>
              <h3 className="mb-1 text-base font-extrabold text-tinta">Produtos</h3>
              <ul className="divide-y divide-linha rounded-xl border border-linha bg-white px-3">
                {d.produtos.map((p) => (
                  <li key={p.nome} className="flex justify-between gap-3 py-2 text-base">
                    <span className="text-tinta">{p.nome}</span>
                    <strong className="text-tinta">{p.quantidade} un.</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {d.visitas.length > 0 && (
            <section>
              <h3 className="mb-1 text-base font-extrabold text-tinta">Visitas</h3>
              <ol className="divide-y divide-linha rounded-xl border border-linha bg-white px-3">
                {d.visitas.map((v) => (
                  <li key={v.id} className="py-2">
                    <div className="flex justify-between gap-3 text-base">
                      <span className="font-bold text-tinta">{v.servico}</span>
                      <span className="shrink-0 tabular-nums text-tinta">{v.valor !== undefined ? reais(v.valor) : ""}</span>
                    </div>
                    <p className="text-sm text-tinta-suave">
                      {FMT_DATA.format(dataDe(v.data))}
                      {v.produtos.length > 0 && ` · ${v.produtos.map((p) => `${p.quantidade}× ${p.nome}`).join(", ")}`}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </Folha>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-linha bg-white p-3">
      <p className="text-sm font-semibold text-tinta-suave">{rotulo}</p>
      <p className="text-xl font-extrabold text-tinta">{valor}</p>
    </div>
  );
}
