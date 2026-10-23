import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { DIAS_SEMANA, mascaraCelular, somenteDigitos } from "../lib/formato";
import { mensagemDeErro, pb, urlArquivo } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { DiaFuncionamento } from "../lib/tipos";

const HORARIO_PADRAO: DiaFuncionamento[] = DIAS_SEMANA.map((_, i) => ({
  aberto: i !== 0,
  abre: "08:00",
  fecha: i === 6 ? "14:00" : "18:00",
}));

// Mesmos padrões do servidor (pb_hooks/lib.js → TEXTOS_PADRAO).
const TEXTOS_PADRAO = {
  confirmada: "Sua vez no {empresa} foi confirmada! Previsão de início: {hora}.",
  aviso_vez: "Faltam {minutos} minutos para a sua vez no {empresa}. Se quiser, já pode vir, temos café esperando!",
  pronto: "Seu carro está pronto no {empresa}. Pode vir buscar!",
  avaliacao: "Como foi sua lavagem no {empresa}? Toque para avaliar.",
};
type ChaveTexto = keyof typeof TEXTOS_PADRAO;
const ROTULO_TEXTO: Record<ChaveTexto, string> = {
  confirmada: "Quando a vez é confirmada",
  aviso_vez: "“Já pode vir” (aviso antes da vez)",
  pronto: "Quando o carro fica pronto",
  avaliacao: "Convite para avaliar (depois da baixa)",
};

const TEXTO_AVISO_PADRAO =
  "Faltam {minutos} minutos para a sua vez no {empresa}. Se quiser, já pode vir, temos café esperando!";

export function Configuracoes() {
  const { empresa, vinculo, recarregarEmpresa } = useEmpresa();
  const [nome, setNome] = useState(empresa.nome);
  const [whatsapp, setWhatsapp] = useState(mascaraCelular(empresa.whatsapp?.replace(/^55(?=\d{10,11}$)/, "") || ""));
  const [endereco, setEndereco] = useState(empresa.endereco || "");
  const [capacidade, setCapacidade] = useState(String(empresa.capacidade_simultanea || 2));
  const [tolerancia, setTolerancia] = useState(String(empresa.tolerancia_min ?? 10));
  const [aviso, setAviso] = useState(String(empresa.aviso_min ?? 15));
  const [busca, setBusca] = useState(!!empresa.oferece_busca);
  const [textos, setTextos] = useState<Record<ChaveTexto, string>>(() => {
    const salvos = (empresa.textos_aviso || {}) as Partial<Record<ChaveTexto, string>>;
    return {
      confirmada: salvos.confirmada || TEXTOS_PADRAO.confirmada,
      aviso_vez: salvos.aviso_vez || TEXTO_AVISO_PADRAO,
      pronto: salvos.pronto || TEXTOS_PADRAO.pronto,
      avaliacao: salvos.avaliacao || TEXTOS_PADRAO.avaliacao,
    };
  });
  const [horario, setHorario] = useState<DiaFuncionamento[]>(
    empresa.horario_funcionamento?.length === 7 ? empresa.horario_funcionamento : HORARIO_PADRAO,
  );
  const [logo, setLogo] = useState<File | null>(null);
  const [previaLogo, setPreviaLogo] = useState(urlArquivo(empresa, empresa.logo, "128x128"));
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);


  if (!pode(vinculo, "configurar_empresa")) return <Navigate to={`/${empresa.slug}`} replace />;

  function mudarDia(i: number, parcial: Partial<DiaFuncionamento>) {
    setHorario((h) => h.map((d, j) => (j === i ? { ...d, ...parcial } : d)));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setOk(false);
    const zap = somenteDigitos(whatsapp);
    if (nome.trim().length < 2) return setErro("Digite o nome do lava rápido.");
    if (zap && !/^\d{10,11}$/.test(zap)) return setErro("WhatsApp inválido. Use DDD + número.");
    for (const d of horario) {
      if (d.aberto && d.abre >= d.fecha) return setErro("Em algum dia o horário de abrir está depois do de fechar.");
    }
    const dados = new FormData();
    dados.append("nome", nome.trim());
    dados.append("whatsapp", zap ? "55" + zap : "");
    dados.append("endereco", endereco.trim());
    dados.append("capacidade_simultanea", capacidade);
    dados.append("oferece_busca", String(busca));
    dados.append("tolerancia_min", tolerancia);
    dados.append("aviso_min", aviso);
    const limpos = Object.fromEntries(Object.entries(textos).map(([k, v]) => [k, v.trim() || TEXTOS_PADRAO[k as ChaveTexto]]));
    dados.append("textos_aviso", JSON.stringify({ ...(empresa.textos_aviso || {}), ...limpos }));
    dados.append("horario_funcionamento", JSON.stringify(horario));
    if (logo) dados.append("logo", logo);
    setSalvando(true);
    try {
      await pb.collection("empresas").update(empresa.id, dados);
      await recarregarEmpresa();
      setOk(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  const exemplo = (t: string) => t.replaceAll("{minutos}", aviso || "15").replaceAll("{empresa}", nome).replaceAll("{hora}", "14:30");

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Configurações">
      <form onSubmit={salvar} className="flex flex-col gap-6" noValidate>
        {ok && <Aviso tipo="sucesso">Configurações salvas.</Aviso>}

        <Secao titulo="Identidade">
          <Campo rotulo="Nome do lava rápido" value={nome} onChange={(e) => setNome(e.target.value)} />
          <div className="flex items-center gap-4">
            {previaLogo ? (
              <img src={previaLogo} alt="Logo" className="h-20 w-20 rounded-2xl border border-linha bg-white object-contain p-1" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-linha text-sm text-tinta-suave">
                Sem logo
              </span>
            )}
            <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border-2 border-linha bg-white px-5 text-base font-bold text-tinta hover:border-tinta-suave">
              Escolher logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 2 * 1024 * 1024) return setErro("O logo precisa ter no máximo 2 MB.");
                  setLogo(f);
                  setPreviaLogo(URL.createObjectURL(f));
                }}
              />
            </label>
          </div>
          <p className="text-sm text-tinta-suave">As cores do app seguem o padrão DNM&amp;LTDA (azul-marinho e dourado) para todos os lava rápidos.</p>
        </Secao>

        <Secao titulo="Contato">
          <Campo
            rotulo="WhatsApp do lava rápido"
            type="tel"
            inputMode="numeric"
            placeholder="(11) 98765-4321"
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascaraCelular(e.target.value))}
          />
          <Campo rotulo="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </Secao>

        <Secao titulo="Fila">
          <Campo
            rotulo="Carros lavados ao mesmo tempo"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={capacidade}
            onChange={(e) => setCapacidade(e.target.value)}
            ajuda="Usado para calcular a previsão de cada carro."
          />
          <Campo
            rotulo="Tolerância de atraso do cliente (min)"
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            value={tolerancia}
            onChange={(e) => setTolerancia(e.target.value)}
            ajuda="Passou disso, o próximo que estiver no local sobe."
          />
          <Interruptor
            rotulo="Buscamos o carro do cliente"
            descricao="O cliente pode pedir a busca ao entrar na fila. O app avisa que tem taxa adicional; local e valor vocês combinam no WhatsApp."
            ligado={busca}
            onChange={setBusca}
          />
        </Secao>

        <Secao titulo="Aviso ao cliente">
          <Campo
            rotulo="Avisar quantos minutos antes"
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            value={aviso}
            onChange={(e) => setAviso(e.target.value)}
          />
          <p className="text-sm text-tinta-suave">
            Os avisos chegam como notificação no celular do cliente (com o app instalado). Use {"{empresa}"}, {"{minutos}"} e {"{hora}"}:
            o app troca pelos valores certos.
          </p>
          {(Object.keys(ROTULO_TEXTO) as ChaveTexto[]).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <label htmlFor={`texto-${k}`} className="text-base font-semibold text-tinta">
                {ROTULO_TEXTO[k]}
              </label>
              <textarea
                id={`texto-${k}`}
                rows={2}
                maxLength={300}
                value={textos[k]}
                onChange={(e) => setTextos((t) => ({ ...t, [k]: e.target.value }))}
                className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base text-tinta focus:border-marca focus:outline-none"
              />
              <p className="rounded-lg bg-marca-suave px-3 py-2 text-sm text-tinta">
                <span className="font-bold">Cliente lê:</span> {exemplo(textos[k])}
              </p>
            </div>
          ))}
        </Secao>

        <Secao titulo="Horário de funcionamento">
          {horario.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-linha bg-white p-3">
              <label className="flex min-h-12 min-w-28 items-center gap-3 text-base font-semibold text-tinta">
                <input type="checkbox" className="h-6 w-6 accent-[var(--marca)]" checked={d.aberto} onChange={(e) => mudarDia(i, { aberto: e.target.checked })} />
                {DIAS_SEMANA[i]}
              </label>
              {d.aberto ? (
                <span className="flex items-center gap-2">
                  <input type="time" aria-label={`${DIAS_SEMANA[i]}: abre`} value={d.abre} onChange={(e) => mudarDia(i, { abre: e.target.value })} className="min-h-12 rounded-xl border-2 border-linha px-2 text-base" />
                  <span className="text-tinta-suave">às</span>
                  <input type="time" aria-label={`${DIAS_SEMANA[i]}: fecha`} value={d.fecha} onChange={(e) => mudarDia(i, { fecha: e.target.value })} className="min-h-12 rounded-xl border-2 border-linha px-2 text-base" />
                </span>
              ) : (
                <span className="text-base text-tinta-suave">Fechado</span>
              )}
            </div>
          ))}
        </Secao>

        {erro && <Aviso>{erro}</Aviso>}
        <div className="sticky bottom-0 -mx-4 bg-fundo/95 px-4 py-3 backdrop-blur">
          <Botao type="submit" largo carregando={salvando}>
            Salvar configurações
          </Botao>
        </div>
      </form>
    </Moldura>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-extrabold uppercase tracking-wide text-tinta-suave">{titulo}</h2>
      {children}
    </section>
  );
}
