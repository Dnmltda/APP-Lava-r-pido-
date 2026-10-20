import QRCode from "qrcode";
import { Maximize } from "lucide-react";
import { useEffect, useState } from "react";
import { useEmpresa } from "../contexto/Empresa";
import { emQuanto, hora, useFilaAoVivo, type ItemPublico } from "../lib/fila";
import { urlArquivo } from "../lib/pb";

// Modo TV: a fila em tela cheia para uma TV ou tablet na recepção. Abre sem login e mostra
// só o que já é público (primeiro nome, final da placa, serviço e previsão). Atualiza sozinha.

const MAX_FILA = 8;
const FMT_RELOGIO = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function useRelogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return agora;
}

// Mantém a tela acesa enquanto o Modo TV estiver aberto (onde o navegador permitir).
function useTelaAcesa() {
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") trava = await wl.request("screen");
      } catch {
        // sem permissão: a TV/tablet precisa estar com o descanso de tela desligado
      }
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      trava?.release().catch(() => {});
    };
  }, []);
}

function Nome({ item }: { item: ItemPublico }) {
  return (
    <span className="min-w-0 truncate">
      <span className="font-extrabold">{item.nome}</span>
      {item.final_placa && <span className="ml-3 font-mono font-bold opacity-70">…{item.final_placa}</span>}
    </span>
  );
}

export function ModoTV() {
  const { empresa } = useEmpresa();
  const { publica, erro } = useFilaAoVivo(empresa.slug, empresa.id);
  const relogio = useRelogio();
  const [qr, setQr] = useState("");
  const [telaCheia, setTelaCheia] = useState(false);
  const link = `${window.location.origin}/${empresa.slug}`;
  const logo = urlArquivo(empresa, empresa.logo, "128x128");
  useTelaAcesa();

  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }).then(setQr, () => setQr(""));
  }, [link]);
  useEffect(() => {
    const mudou = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);

  const proximos = publica?.fila.slice(0, MAX_FILA) || [];
  const resto = (publica?.fila.length || 0) - proximos.length;

  return (
    <div className="flex min-h-dvh flex-col bg-fundo text-tinta [font-size:clamp(16px,1.6vw,34px)]">
      <header className="flex items-center gap-4 bg-marca px-[3vw] py-[1.5vh] text-sobre-marca">
        {logo && <img src={logo} alt="" className="h-[2.6em] w-[2.6em] rounded-xl bg-white object-contain p-1" />}
        <h1 className="min-w-0 flex-1 truncate text-[1.6em] font-black">{empresa.nome}</h1>
        <span className="flex items-center gap-2 text-[0.8em] font-semibold opacity-90">
          <span className="h-[0.6em] w-[0.6em] animate-pulse rounded-full bg-green-400" /> ao vivo
        </span>
        <span className="text-[1.6em] font-black tabular-nums">{FMT_RELOGIO.format(relogio)}</span>
        {!telaCheia && document.fullscreenEnabled && (
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-white/15 px-4 text-[0.7em] font-bold hover:bg-white/25"
          >
            <Maximize className="h-5 w-5" aria-hidden="true" /> Tela cheia
          </button>
        )}
      </header>

      {!publica ? (
        <p className="m-auto text-[1.4em] font-bold text-tinta-suave">{erro || "Carregando a fila…"}</p>
      ) : (
        <main className="grid flex-1 gap-[2vw] p-[2vw] lg:grid-cols-[1fr_1.4fr_1fr]">
          <section aria-labelledby="tv-lavando" className="flex flex-col gap-[1vh]">
            <h2 id="tv-lavando" className="text-[0.9em] font-extrabold uppercase tracking-wide text-tinta-suave">
              Lavando agora
            </h2>
            {publica.lavando.length === 0 ? (
              <p className="text-[1em] text-tinta-suave">Nenhum carro no box.</p>
            ) : (
              publica.lavando.map((i) => (
                <div key={i.id} className="rounded-2xl border-2 border-marca/30 bg-white px-[1em] py-[0.6em] shadow-sm">
                  <p className="flex items-baseline justify-between gap-3 text-[1.3em]">
                    <Nome item={i} />
                  </p>
                  <p className="text-[0.8em] text-tinta-suave">
                    {i.servico}
                    {i.inicio_em ? ` · desde ${hora(i.inicio_em)}` : ""}
                  </p>
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="tv-fila" className="flex flex-col gap-[1vh]">
            <h2 id="tv-fila" className="text-[0.9em] font-extrabold uppercase tracking-wide text-tinta-suave">
              Próximos {publica.fila.length > 0 && `(${publica.fila.length})`}
            </h2>
            {proximos.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-linha px-[1em] py-[1.5em] text-center">
                <p className="text-[1.3em] font-extrabold">Sem fila agora</p>
                <p className="text-[0.9em] text-tinta-suave">Quem chegar é atendido logo.</p>
              </div>
            ) : (
              <ol className="flex flex-col gap-[0.8vh]">
                {proximos.map((i) => (
                  <li key={i.id} className={`flex items-center gap-[0.8em] rounded-2xl bg-white px-[1em] py-[0.5em] shadow-sm ${i.posicao === 1 ? "ring-4 ring-marca" : ""}`}>
                    <span className="w-[1.8em] shrink-0 text-[1.5em] font-black text-marca-forte tabular-nums">{i.posicao}º</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[1.15em]">
                        <Nome item={i} />
                      </span>
                      <span className="truncate text-[0.75em] text-tinta-suave">{i.reservado ? "Horário reservado" : i.servico}</span>
                    </span>
                    {i.previsao && (
                      <span className="shrink-0 text-right">
                        <span className="block text-[1.2em] font-black tabular-nums">{hora(i.previsao)}</span>
                        <span className="block text-[0.7em] text-tinta-suave">{emQuanto(i.previsao, publica.agora)}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {resto > 0 && <p className="text-[0.85em] font-semibold text-tinta-suave">+ {resto} na fila</p>}
          </section>

          <section aria-labelledby="tv-prontos" className="flex flex-col gap-[1vh]">
            <h2 id="tv-prontos" className="text-[0.9em] font-extrabold uppercase tracking-wide text-tinta-suave">
              Pronto, pode retirar
            </h2>
            {publica.prontos.length === 0 ? (
              <p className="text-[1em] text-tinta-suave">Nenhum carro esperando retirada.</p>
            ) : (
              publica.prontos.map((i) => (
                <div key={i.id} className="rounded-2xl bg-green-700 px-[1em] py-[0.6em] text-white shadow-sm">
                  <p className="text-[1.3em]">
                    <Nome item={i} />
                  </p>
                </div>
              ))
            )}
            <div className="mt-auto flex items-center gap-[1em] rounded-2xl bg-white p-[0.8em] shadow-sm">
              {qr && <div className="w-[5.5em] shrink-0" role="img" aria-label={`QR Code para ${link}`} dangerouslySetInnerHTML={{ __html: qr }} />}
              <p className="text-[0.85em] font-semibold leading-snug">
                Entre na fila pelo celular: aponte a câmera para o código.
                <span className="mt-1 block text-[0.85em] font-normal text-tinta-suave">
                  Entrando agora, previsão {hora(publica.proxima_vaga)}
                </span>
              </p>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
