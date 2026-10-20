import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Cartao } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { DIAS_SEMANA, mascaraCelular, somenteDigitos } from "../lib/formato";
import { mensagemDeErro, pb, urlArquivo } from "../lib/pb";
import { pode } from "../lib/permissoes";
import { aplicarTema } from "../lib/tema";
import type { DiaFuncionamento } from "../lib/tipos";

const HORARIO_PADRAO: DiaFuncionamento[] = DIAS_SEMANA.map((_, i) => ({
  aberto: i !== 0,
  abre: "08:00",
  fecha: i === 6 ? "14:00" : "18:00",
}));

const TEXTO_AVISO_PADRAO =
  "Faltam {minutos} minutos para a sua vez no {empresa}. Se quiser, já pode vir, temos café esperando!";

export function Configuracoes() {
  const { empresa, vinculo, recarregarEmpresa } = useEmpresa();
  const [nome, setNome] = useState(empresa.nome);
  const [cor, setCor] = useState(empresa.cor_principal || "#0E7490");
  const [whatsapp, setWhatsapp] = useState(mascaraCelular(empresa.whatsapp?.replace(/^55(?=\d{10,11}$)/, "") || ""));
  const [endereco, setEndereco] = useState(empresa.endereco || "");
  const [capacidade, setCapacidade] = useState(String(empresa.capacidade_simultanea || 2));
  const [tolerancia, setTolerancia] = useState(String(empresa.tolerancia_min ?? 10));
  const [aviso, setAviso] = useState(String(empresa.aviso_min ?? 15));
  const [textoAviso, setTextoAviso] = useState(empresa.textos_aviso?.aviso_vez || TEXTO_AVISO_PADRAO);
  const [horario, setHorario] = useState<DiaFuncionamento[]>(
    empresa.horario_funcionamento?.length === 7 ? empresa.horario_funcionamento : HORARIO_PADRAO,
  );
  const [logo, setLogo] = useState<File | null>(null);
  const [previaLogo, setPreviaLogo] = useState(urlArquivo(empresa, empresa.logo, "128x128"));
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Prévia da cor ao vivo; ao sair sem salvar, volta a cor da empresa.
  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(cor)) aplicarTema(cor);
  }, [cor]);
  const corSalva = useRef(empresa.cor_principal);
  useEffect(() => {
    corSalva.current = empresa.cor_principal;
  }, [empresa.cor_principal]);
  useEffect(() => () => aplicarTema(corSalva.current), []);

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
    dados.append("cor_principal", cor);
    dados.append("whatsapp", zap ? "55" + zap : "");
    dados.append("endereco", endereco.trim());
    dados.append("capacidade_simultanea", capacidade);
    dados.append("tolerancia_min", tolerancia);
    dados.append("aviso_min", aviso);
    dados.append("textos_aviso", JSON.stringify({ ...(empresa.textos_aviso || {}), aviso_vez: textoAviso.trim() }));
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

  const exemploAviso = textoAviso.replaceAll("{minutos}", aviso || "15").replaceAll("{empresa}", nome);

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
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Campo rotulo="Cor principal" value={cor} onChange={(e) => setCor(e.target.value)} maxLength={7} />
            </div>
            <input
              type="color"
              aria-label="Escolher cor"
              value={/^#[0-9a-fA-F]{6}$/.test(cor) ? cor : "#0E7490"}
              onChange={(e) => setCor(e.target.value)}
              className="h-12 w-16 cursor-pointer rounded-xl border-2 border-linha bg-white p-1"
            />
          </div>
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="texto-aviso" className="text-base font-semibold text-tinta">
              Mensagem
            </label>
            <textarea
              id="texto-aviso"
              rows={3}
              value={textoAviso}
              onChange={(e) => setTextoAviso(e.target.value)}
              className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base text-tinta focus:border-marca focus:outline-none"
            />
            <p className="text-sm text-tinta-suave">
              Use {"{minutos}"} e {"{empresa}"}: o app troca pelos valores certos.
            </p>
          </div>
          <Cartao className="bg-marca-suave">
            <p className="text-sm font-bold text-tinta-suave">Como o cliente vai ler:</p>
            <p className="mt-1 text-base text-tinta">{exemploAviso}</p>
          </Cartao>
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
