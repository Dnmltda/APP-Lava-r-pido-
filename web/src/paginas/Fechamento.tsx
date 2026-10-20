import { FileText, Paperclip } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { comprimirImagem } from "../lib/imagem";
import { primeiroNome, reais } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { FechamentoDia } from "../lib/tipos";

// Fechamento do dia: quem está no lava rápido (gerente ou dono) confere as maquininhas, o Pix e o
// dinheiro e anexa as notas (foto ou PDF). O dono acompanha de onde estiver.

const OFFSET = 3 * 3600000;
const DIA = 86400000;
const hojeSP = () => new Date(Date.now() - OFFSET).toISOString().slice(0, 10);
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const paraNumero = (t: string) => (t.trim() ? Number(t.replace(/\./g, "").replace(",", ".")) : 0);
const paraTexto = (n: number) => (n ? String(n).replace(".", ",") : "");
const diaLegivel = (d: string) => FMT_DIA.format(new Date(`${d}T12:00:00Z`));

interface Sistema {
  resumo: { carros: number; servicos: number; produtos: number; total: number };
  por_forma_pagamento: Record<string, number>;
}

export function Fechamento() {
  const { empresa, vinculo } = useEmpresa();
  const [dia, setDia] = useState(hojeSP());
  const [recentes, setRecentes] = useState<FechamentoDia[] | null>(null);
  const [versao, setVersao] = useState(0);
  const podeLancar = vinculo?.ativo && (vinculo.papel === "patrao" || vinculo.papel === "gerente");

  useEffect(() => {
    pb.collection("fechamentos_dia")
      .getList<FechamentoDia>(1, 31, { filter: pb.filter("empresa = {:e}", { e: empresa.id }), sort: "-dia", fields: "id,dia,cartao,pix,dinheiro,anexos" })
      .then((r) => setRecentes(r.items))
      .catch(() => setRecentes([]));
  }, [empresa.id, versao]);

  if (!pode(vinculo, "ver_valores")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}/caixa`} titulo="Fechamento do dia">
      <Campo rotulo="Dia" type="date" max={hojeSP()} value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
      <div className="mt-4">
        <DiaDoFechamento key={dia} dia={dia} podeLancar={!!podeLancar} onSalvo={() => setVersao((v) => v + 1)} />
      </div>

      <h2 className="mt-8 text-lg font-extrabold text-tinta">Últimos fechamentos</h2>
      {recentes === null ? (
        <Carregando />
      ) : recentes.length === 0 ? (
        <p className="mt-2 text-base text-tinta-suave">Nenhum dia fechado ainda.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {recentes.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => {
                  setDia(f.dia);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-2 text-left ${f.dia === dia ? "border-marca" : "border-linha"}`}
              >
                <span>
                  <span className="block text-base font-bold capitalize text-tinta">{diaLegivel(f.dia)}</span>
                  <span className="block text-sm text-tinta-suave">
                    {f.anexos?.length || 0} {f.anexos?.length === 1 ? "nota" : "notas"}
                  </span>
                </span>
                <span className="text-base font-extrabold tabular-nums text-tinta">{reais(f.cartao + f.pix + f.dinheiro)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Moldura>
  );
}

function DiaDoFechamento({ dia, podeLancar, onSalvo }: { dia: string; podeLancar: boolean; onSalvo: () => void }) {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  const [registro, setRegistro] = useState<FechamentoDia | null | undefined>(undefined);
  const [sistema, setSistema] = useState<Sistema | null>(null);
  const [token, setToken] = useState("");
  const [cartao, setCartao] = useState("");
  const [pix, setPix] = useState("");
  const [dinheiro, setDinheiro] = useState("");
  const [obs, setObs] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const lista = await pb.collection("fechamentos_dia").getFullList<FechamentoDia>({
        filter: pb.filter("empresa = {:e} && dia = {:d}", { e: empresa.id, d: dia }),
        expand: "criado_por,atualizado_por",
      });
      const r = lista[0] || null;
      setRegistro(r);
      setCartao(paraTexto(r?.cartao || 0));
      setPix(paraTexto(r?.pix || 0));
      setDinheiro(paraTexto(r?.dinheiro || 0));
      setObs(r?.observacao || "");
      if (r?.anexos?.length) setToken(await pb.files.getToken());
    } catch (err) {
      setErro(mensagemDeErro(err));
      setRegistro(null);
    }
  }, [empresa.id, dia]);

  useEffect(() => {
    carregar();
    const [a, m, d] = dia.split("-").map(Number);
    const de = Date.UTC(a, m - 1, d) + OFFSET;
    pb.send<Sistema>(`/api/lr/relatorio/${empresa.id}`, {
      method: "GET",
      query: { de: new Date(de).toISOString(), ate: new Date(de + DIA).toISOString() },
    })
      .then(setSistema)
      .catch(() => setSistema(null));
  }, [carregar, dia, empresa.id]);

  const total = paraNumero(cartao) + paraNumero(pix) + paraNumero(dinheiro);
  const diferenca = sistema ? Math.round((total - sistema.resumo.total) * 100) / 100 : 0;

  async function salvar() {
    setErro("");
    setOk("");
    const valores = { cartao: paraNumero(cartao), pix: paraNumero(pix), dinheiro: paraNumero(dinheiro) };
    if (Object.values(valores).some((v) => isNaN(v) || v < 0)) return setErro("Confira os valores: use só números, ex.: 350,50.");
    if (arquivos.length + (registro?.anexos?.length || 0) > 20) return setErro("No máximo 20 notas por dia.");
    setSalvando(true);
    try {
      const f = new FormData();
      f.append("cartao", String(valores.cartao));
      f.append("pix", String(valores.pix));
      f.append("dinheiro", String(valores.dinheiro));
      f.append("observacao", obs.trim());
      for (const a of arquivos) f.append(registro ? "anexos+" : "anexos", await comprimirImagem(a));
      if (registro) await pb.collection("fechamentos_dia").update(registro.id, f);
      else {
        f.append("empresa", empresa.id);
        f.append("dia", dia);
        f.append("criado_por", usuario!.id);
        await pb.collection("fechamentos_dia").create(f);
      }
      setArquivos([]);
      setOk("Fechamento salvo. O dono já consegue ver.");
      await carregar();
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível salvar. Confira a internet e tente de novo."));
    } finally {
      setSalvando(false);
    }
  }

  if (registro === undefined) return <Carregando />;
  const travado = !podeLancar;

  return (
    <div className="flex flex-col gap-4">
      {sistema && (
        <div className="rounded-2xl border border-linha bg-white p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-suave">O app registrou</p>
          <p className="mt-1 text-base text-tinta">
            {sistema.resumo.carros} {sistema.resumo.carros === 1 ? "carro" : "carros"} · serviços {reais(sistema.resumo.servicos)} · produtos {reais(sistema.resumo.produtos)}
          </p>
          <p className="text-2xl font-black text-tinta">{reais(sistema.resumo.total)}</p>
          {sistema.resumo.produtos > 0 && (
            <p className="text-sm text-tinta-suave">
              Produtos por forma: cartão {reais(sistema.por_forma_pagamento.cartao || 0)} · Pix {reais(sistema.por_forma_pagamento.pix || 0)} · dinheiro{" "}
              {reais(sistema.por_forma_pagamento.dinheiro || 0)}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Campo rotulo="Cartão (R$)" inputMode="decimal" disabled={travado} value={cartao} onChange={(e) => setCartao(e.target.value.replace(/[^\d,.]/g, ""))} />
        <Campo rotulo="Pix (R$)" inputMode="decimal" disabled={travado} value={pix} onChange={(e) => setPix(e.target.value.replace(/[^\d,.]/g, ""))} />
        <Campo rotulo="Dinheiro (R$)" inputMode="decimal" disabled={travado} value={dinheiro} onChange={(e) => setDinheiro(e.target.value.replace(/[^\d,.]/g, ""))} />
      </div>
      <div className="flex items-baseline justify-between rounded-2xl bg-marca-suave px-4 py-3">
        <span className="text-base font-bold text-tinta">Conferido</span>
        <span className="text-2xl font-black tabular-nums text-tinta">{reais(total)}</span>
      </div>
      {sistema && total > 0 && Math.abs(diferenca) >= 0.01 && (
        <Aviso tipo="info">
          {diferenca > 0 ? `Sobrou ${reais(diferenca)}` : `Faltou ${reais(-diferenca)}`} em relação ao que o app registrou. Explique na observação, se souber o motivo.
        </Aviso>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="obs-fechamento" className="text-base font-semibold text-tinta">
          Observação (opcional)
        </label>
        <textarea
          id="obs-fechamento"
          rows={3}
          maxLength={1000}
          disabled={travado}
          placeholder="Ex.: maquininha 2 sem sinal à tarde; troco inicial R$ 100"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base focus:border-marca focus:outline-none disabled:bg-fundo"
        />
      </div>

      <section aria-labelledby="titulo-notas">
        <h3 id="titulo-notas" className="mb-2 text-base font-extrabold text-tinta">
          Notas do dia {registro?.anexos?.length ? `(${registro.anexos.length})` : ""}
        </h3>
        {registro?.anexos?.length ? (
          <div className="grid grid-cols-3 gap-2">
            {registro.anexos.map((a) => {
              const url = pb.files.getURL(registro, a, { token });
              const pdf = a.toLowerCase().endsWith(".pdf");
              return (
                <a key={a} href={url} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-linha bg-fundo">
                  {pdf ? (
                    <span className="flex flex-col items-center gap-1 text-sm font-bold text-tinta">
                      <FileText className="h-8 w-8" aria-hidden="true" /> PDF
                    </span>
                  ) : (
                    <img src={pb.files.getURL(registro, a, { token, thumb: "400x0" })} alt="Nota anexada" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-base text-tinta-suave">Nenhuma nota anexada.</p>
        )}
        {!travado && (
          <label className="mt-3 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-marca px-4 text-base font-bold text-marca-forte">
            <Paperclip className="h-5 w-5" aria-hidden="true" />
            {arquivos.length ? `${arquivos.length} arquivo(s) para enviar` : "Anexar notas (foto ou PDF)"}
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => setArquivos(Array.from(e.target.files || []).slice(0, 20))}
            />
          </label>
        )}
      </section>

      {registro && (
        <p className="text-sm text-tinta-suave">
          Fechado por {primeiroNome(registro.expand?.criado_por?.nome || "")} em {FMT_HORA.format(new Date(registro.created.replace(" ", "T")))}
          {registro.atualizado_por && registro.updated !== registro.created
            ? ` · atualizado por ${primeiroNome(registro.expand?.atualizado_por?.nome || "")} em ${FMT_HORA.format(new Date(registro.updated.replace(" ", "T")))}`
            : ""}
        </p>
      )}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      {travado ? (
        <p className="text-sm text-tinta-suave">Quem lança o fechamento é o gerente ou o dono. Você pode consultar.</p>
      ) : (
        <Botao largo carregando={salvando} onClick={salvar}>
          {registro ? "Salvar alterações" : "Fechar o dia"}
        </Botao>
      )}
      {!travado && <p className="text-sm text-tinta-suave">As notas ficam guardadas e não se apagam. Tudo fica registrado (quem fez e quando).</p>}
    </div>
  );
}
