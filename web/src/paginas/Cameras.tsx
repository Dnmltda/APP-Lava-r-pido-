import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, EstadoVazio, Folha, Girador, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { Camera, CameraEvento, TipoCamera } from "../lib/tipos";

// ETAPA 7 — Câmeras (só o patrão). O app nunca recebe o endereço nem o token do
// gateway: pede um passe de 10 minutos e a imagem/vídeo passa pelo servidor.

const NOME_TIPO: Record<TipoCamera, { titulo: string; texto: string }> = {
  imagem: { titulo: "Imagem ao vivo", texto: "Foto atualizada a cada segundo (go2rtc). Funciona em qualquer celular." },
  hls: { titulo: "Vídeo ao vivo", texto: "Vídeo HLS do gateway (MediaMTX/go2rtc). Gasta mais internet." },
  app_fabricante: { titulo: "App do fabricante", texto: "Botão que abre o app ou a nuvem da câmera (Intelbras, Hikvision…)." },
  demonstracao: { titulo: "Demonstração", texto: "Imagem de teste gerada pelo servidor, para ver a tela funcionando." },
};
const RENOVAR_PASSE_MS = 8 * 60 * 1000;
const SENSOR_SEM_SINAL_MS = 5 * 60 * 1000;
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const ms = (d: string) => (d ? Date.parse(d.replace(" ", "T")) : 0);

export function Cameras() {
  const { empresa, vinculo } = useEmpresa();
  const [lista, setLista] = useState<Camera[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Camera | "nova" | null>(null);
  const [ampliada, setAmpliada] = useState<Camera | null>(null);
  const [historico, setHistorico] = useState<Camera | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(
        await pb.collection("cameras").getFullList<Camera>({
          filter: pb.filter("empresa = {:e}", { e: empresa.id }),
          sort: "-ativo,ordem,nome",
        }),
      );
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id]);

  useEffect(() => {
    carregar();
    // Atualiza o estado dos sensores de movimento.
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [carregar]);

  if (!pode(vinculo, "cameras")) return <Navigate to={`/${empresa.slug}`} replace />;
  const configura = pode(vinculo, "configurar_cameras");

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Câmeras">
      <p className="text-base text-tinta-suave">
        {configura ? "Só você (dono) e quem você liberar veem esta tela." : "O dono liberou para você ver as câmeras."} Cada vez que abre, fica
        registrado no histórico.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {erro ? (
          <div className="sm:col-span-2">
            <EstadoErro texto={erro} tentar={carregar} />
          </div>
        ) : lista === null ? (
          <div className="sm:col-span-2">
            <Carregando />
          </div>
        ) : lista.length === 0 ? (
          <div className="sm:col-span-2">
            <EstadoVazio titulo="Nenhuma câmera ainda" texto="Cadastre a primeira. Para testar, escolha o tipo “Demonstração”." />
          </div>
        ) : (
          lista.map((c) => (
            <CartaoCamera key={c.id} camera={c} onEditar={configura ? () => setEditando(c) : undefined} onAmpliar={() => setAmpliada(c)} onHistorico={() => setHistorico(c)} />
          ))
        )}
      </div>
      {configura && (
        <Botao largo variante="secundario" className="mt-5" onClick={() => setEditando("nova")}>
          + Nova câmera
        </Botao>
      )}
      {configura && <details className="mt-5 rounded-2xl border border-linha bg-white p-4 text-base text-tinta">
        <summary className="cursor-pointer font-bold">Como ligar as câmeras do DVR</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-tinta-suave">
          <li>O jeito mais fácil: use o botão do app do fabricante (Intelbras, Hikvision…).</li>
          <li>
            Para ver dentro deste app: um computadorzinho na loja (gateway go2rtc ou MediaMTX) lê as câmeras e um túnel seguro
            (Cloudflare) cria um endereço https://. Cadastre aqui esse endereço e o token.
          </li>
          <li>Nunca abra a porta do DVR na internet. Peça ajuda ao técnico — o passo a passo está no guia do sistema.</li>
        </ol>
      </details>}
      {editando && (
        <EditarCamera
          camera={editando === "nova" ? null : editando}
          empresaId={empresa.id}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
      {historico && <HistoricoSensor camera={historico} onFechar={() => setHistorico(null)} onMudou={carregar} />}
      {ampliada && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={ampliada.nome}>
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-white">
            <span className="text-lg font-bold">{ampliada.nome}</span>
            <button onClick={() => setAmpliada(null)} aria-label="Fechar" className="flex h-12 w-12 items-center justify-center rounded-full text-3xl hover:bg-white/10">
              ×
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <AoVivo camera={ampliada} grande />
          </div>
        </div>
      )}
    </Moldura>
  );
}

function CartaoCamera({
  camera,
  onEditar,
  onAmpliar,
  onHistorico,
}: {
  camera: Camera;
  onEditar?: () => void;
  onAmpliar: () => void;
  onHistorico: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-linha bg-white shadow-sm ${camera.ativo ? "" : "opacity-60"}`}>
      {camera.ativo ? (
        camera.tipo_integracao === "app_fabricante" ? (
          <AbrirApp camera={camera} />
        ) : (
          <button onClick={onAmpliar} className="block w-full bg-black" aria-label={`Ampliar ${camera.nome}`}>
            <AoVivo camera={camera} />
          </button>
        )
      ) : (
        <div className="flex aspect-video items-center justify-center bg-gray-100 text-base text-tinta-suave">Câmera desligada</div>
      )}
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold text-tinta">{camera.nome}</span>
          <span className="block text-sm text-tinta-suave">{NOME_TIPO[camera.tipo_integracao].titulo}</span>
        </span>
        {onEditar && (
          <Botao variante="fantasma" onClick={onEditar}>
            Editar
          </Botao>
        )}
      </div>
      {camera.ativo && camera.monitorar_movimento && (
        <button onClick={onHistorico} className="flex min-h-12 w-full items-center justify-between gap-3 border-t border-linha px-4 py-2 text-left hover:bg-marca-suave">
          <EstadoSensor camera={camera} />
          <span className="text-sm font-bold text-marca-forte">Histórico ›</span>
        </button>
      )}
    </div>
  );
}

function estadoSensor(c: Camera, agora: number): { texto: string; cor: string } {
  const sinal = ms(c.ultimo_sinal_em);
  if (!sinal) return { texto: "Sensor: esperando o DVR conectar", cor: "bg-gray-400" };
  if (agora - sinal > SENSOR_SEM_SINAL_MS) return { texto: "Sensor sem sinal", cor: "bg-red-600" };
  const mov = ms(c.ultimo_movimento_em);
  if (mov && agora - mov < 60000) return { texto: "Movimento agora", cor: "bg-green-600" };
  const desde = Math.max(mov, ms(c.sensor_desde_em));
  const min = Math.max(0, Math.floor((agora - desde) / 60000));
  const limite = c.sem_movimento_min || 10;
  const texto = mov ? `Parado há ${min} min` : `Sem movimento há ${min} min`;
  return { texto, cor: min >= limite ? "bg-amber-500" : "bg-green-600" };
}

function EstadoSensor({ camera }: { camera: Camera }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const e = estadoSensor(camera, agora);
  return (
    <span className="flex min-w-0 items-center gap-2 text-base text-tinta">
      <span className={`h-3 w-3 shrink-0 rounded-full ${e.cor}`} aria-hidden="true" />
      <span className="truncate">{e.texto}</span>
    </span>
  );
}

const TEXTO_EVENTO: Record<CameraEvento["tipo"], (e: CameraEvento) => string> = {
  movimento: () => "Movimento",
  parado: (e) => `Sem movimento por ${e.minutos} min — alerta enviado`,
  desligado: () => "Sensor parou de responder — alerta enviado",
  religado: () => "Sensor voltou a funcionar",
};

function HistoricoSensor({ camera, onFechar, onMudou }: { camera: Camera; onFechar: () => void; onMudou: () => void }) {
  const [eventos, setEventos] = useState<CameraEvento[] | null>(null);
  const [erro, setErro] = useState("");
  const [simulando, setSimulando] = useState(false);
  const carregar = useCallback(async () => {
    try {
      const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const r = await pb.collection("camera_eventos").getList<CameraEvento>(1, 100, {
        filter: pb.filter("camera = {:c} && created >= {:d}", { c: camera.id, d: `${dia} 03:00:00.000Z` }),
        sort: "-created",
      });
      setEventos(r.items);
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [camera.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function simular() {
    setSimulando(true);
    try {
      await pb.send(`/api/lr/sensor/${camera.chave_sensor}`, { method: "POST", body: { tipo: "movimento" } });
      await carregar();
      onMudou();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSimulando(false);
    }
  }

  return (
    <Folha titulo={`Movimento hoje · ${camera.nome}`} onFechar={onFechar}>
      <p className="text-base text-tinta-suave">
        Alerta no seu celular se ficar {camera.sem_movimento_min || 10} min sem movimento no horário de funcionamento.
      </p>
      {camera.tipo_integracao === "demonstracao" && camera.chave_sensor && (
        <Botao largo variante="secundario" className="mt-3" carregando={simulando} onClick={simular}>
          Simular movimento agora
        </Botao>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {erro ? (
          <Aviso>{erro}</Aviso>
        ) : eventos === null ? (
          <Carregando />
        ) : eventos.length === 0 ? (
          <p className="text-base text-tinta-suave">Nada registrado hoje.</p>
        ) : (
          eventos.map((ev) => (
            <div key={ev.id} className="flex items-start gap-3 rounded-xl border border-linha bg-white px-4 py-3">
              <span className="w-12 shrink-0 text-base font-bold tabular-nums text-tinta">{FMT_HORA.format(new Date(ms(ev.created)))}</span>
              <span className={`text-base ${ev.tipo === "movimento" || ev.tipo === "religado" ? "text-tinta" : "font-bold text-red-800"}`}>
                {TEXTO_EVENTO[ev.tipo](ev)}
              </span>
            </div>
          ))
        )}
      </div>
    </Folha>
  );
}

// Pede o passe da câmera e renova antes de vencer.
function usePasse(camera: Camera) {
  const [passe, setPasse] = useState<{ url?: string; link?: string } | null>(null);
  const [erro, setErro] = useState("");
  const pedir = useCallback(async () => {
    try {
      const r = await pb.send<{ url?: string; link?: string }>(`/api/lr/cameras/${camera.id}/acesso`, { method: "POST" });
      setPasse({ link: r.link, url: r.url ? pb.buildURL(r.url) : undefined });
      setErro("");
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível abrir a câmera."));
    }
  }, [camera.id]);
  useEffect(() => {
    pedir();
    const t = setInterval(pedir, RENOVAR_PASSE_MS);
    return () => clearInterval(t);
  }, [pedir]);
  return { passe, erro, pedir };
}

function AbrirApp({ camera }: { camera: Camera }) {
  const { passe, erro } = usePasse(camera);
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-marca-suave p-4 text-center">
      {erro ? (
        <p className="text-base text-red-800">{erro}</p>
      ) : passe?.link ? (
        <a
          href={passe.link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-12 items-center rounded-xl bg-marca px-5 text-base font-bold text-sobre-marca"
        >
          Abrir no app da câmera
        </a>
      ) : (
        <Girador />
      )}
      <p className="text-sm text-tinta-suave">Abre o app ou a nuvem oficial do fabricante.</p>
    </div>
  );
}

function AoVivo({ camera, grande }: { camera: Camera; grande?: boolean }) {
  const { passe, erro, pedir } = usePasse(camera);
  const caixa = grande ? "h-full w-full object-contain" : "aspect-video w-full object-cover";
  if (erro) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-gray-900 p-4 text-center text-white ${grande ? "h-full w-full" : "aspect-video"}`}>
        <span className="text-base">{erro}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            pedir();
          }}
          className="rounded-lg border border-white/40 px-4 py-2 text-sm font-bold"
        >
          Tentar de novo
        </span>
      </div>
    );
  }
  if (!passe?.url) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 text-white ${grande ? "h-full w-full" : "aspect-video"}`}>
        <Girador />
      </div>
    );
  }
  return camera.tipo_integracao === "hls" ? (
    <VideoHls key={passe.url} url={passe.url} className={caixa} />
  ) : (
    <ImagemAoVivo key={passe.url} url={passe.url} nome={camera.nome} className={caixa} />
  );
}

// Busca a imagem seguinte só quando a anterior terminou (não acumula pedidos)
// e pausa quando o app vai para segundo plano.
function ImagemAoVivo({ url, nome, className }: { url: string; nome: string; className: string }) {
  const [src, setSrc] = useState(() => `${url}?t=${Date.now()}`);
  const [semSinal, setSemSinal] = useState(false);
  const proxima = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(proxima.current), []);

  const agendar = (ms: number) => {
    window.clearTimeout(proxima.current);
    proxima.current = window.setTimeout(function tentar() {
      if (document.hidden) {
        proxima.current = window.setTimeout(tentar, 1000);
        return;
      }
      setSrc(`${url}?t=${Date.now()}`);
    }, ms);
  };

  return (
    <div className="relative h-full w-full">
      <img
        src={src}
        alt={`Imagem ao vivo: ${nome}`}
        className={`${className} bg-black`}
        onLoad={() => {
          setSemSinal(false);
          agendar(1000);
        }}
        onError={() => {
          setSemSinal(true);
          agendar(5000);
        }}
      />
      {semSinal && (
        <span className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1 text-center text-sm font-bold text-white">
          Sem sinal — tentando de novo…
        </span>
      )}
    </div>
  );
}

function VideoHls({ url, className }: { url: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let destruir = () => {};
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return setErro("Este navegador não toca vídeo ao vivo.");
        const hls = new Hls({ liveDurationInfinity: true });
        hls.on(Hls.Events.ERROR, (_e, d) => d.fatal && setErro("Sem sinal da câmera."));
        hls.loadSource(url);
        hls.attachMedia(video);
        video.play().catch(() => {});
        destruir = () => hls.destroy();
      });
    }
    return () => {
      destruir();
      video.removeAttribute("src");
    };
  }, [url]);
  return (
    <div className="relative h-full w-full">
      <video ref={ref} muted autoPlay playsInline className={`${className} bg-black`} />
      {erro && <span className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1 text-center text-sm font-bold text-white">{erro}</span>}
    </div>
  );
}

function EditarCamera({
  camera,
  empresaId,
  onFechar,
  onSalvo,
}: {
  camera: Camera | null;
  empresaId: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(camera?.nome || "");
  const [tipo, setTipo] = useState<TipoCamera>(camera?.tipo_integracao || "imagem");
  const [endereco, setEndereco] = useState(camera?.endereco_stream || "");
  const [caminho, setCaminho] = useState(camera?.caminho || "");
  const [token, setToken] = useState("");
  const [apagarToken, setApagarToken] = useState(false);
  const [link, setLink] = useState(camera?.link_app || "");
  const [ordem, setOrdem] = useState(camera ? String(camera.ordem || "") : "");
  const [ativo, setAtivo] = useState(camera ? camera.ativo : true);
  const [monitorar, setMonitorar] = useState(camera ? camera.monitorar_movimento : false);
  const [limite, setLimite] = useState(String(camera?.sem_movimento_min || 10));
  const [chave, setChave] = useState(camera?.chave_sensor || "");
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const gateway = tipo === "imagem" || tipo === "hls";

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro("Dê um nome para a câmera (ex.: Box 1).");
    if (tipo === "app_fabricante" && !/^https:\/\//i.test(link.trim())) return setErro("Cole o link https:// do app ou da nuvem do fabricante.");
    if (gateway && !/^https?:\/\//i.test(endereco.trim())) return setErro("Informe o endereço https:// do gateway.");
    if (gateway && !caminho.trim()) return setErro("Informe o caminho da imagem ou do vídeo.");
    const minutos = parseInt(limite, 10);
    if (monitorar && !(minutos >= 1 && minutos <= 240)) return setErro("Tempo sem movimento: de 1 a 240 minutos.");
    const dados: Record<string, unknown> = {
      empresa: empresaId,
      nome: nome.trim(),
      tipo_integracao: tipo,
      endereco_stream: gateway ? endereco.trim() : "",
      caminho: gateway ? caminho.trim() : "",
      link_app: tipo === "app_fabricante" ? link.trim() : "",
      ordem: parseInt(ordem, 10) || 0,
      ativo,
      monitorar_movimento: monitorar,
      sem_movimento_min: monitorar ? minutos : camera?.sem_movimento_min || 10,
    };
    if (!gateway || apagarToken) dados.gateway_token = "";
    else if (token.trim()) dados.gateway_token = token.trim();
    setSalvando(true);
    try {
      if (camera) await pb.collection("cameras").update(camera.id, dados);
      else await pb.collection("cameras").create(dados);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function novaChave() {
    if (!camera) return;
    try {
      const r = await pb.send<{ chave_sensor: string }>(`/api/lr/cameras/${camera.id}/nova-chave`, { method: "POST" });
      setChave(r.chave_sensor);
      setCopiado(false);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  const enderecoSensor = chave ? pb.buildURL(`/api/lr/sensor/${chave}`) : "";

  async function confirmarExclusao() {
    if (!camera) return;
    setSalvando(true);
    try {
      await pb.collection("cameras").delete(camera.id);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={camera ? "Editar câmera" : "Nova câmera"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="Nome" placeholder="Box 1" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-base font-semibold text-tinta">Como ver esta câmera</legend>
          {(Object.keys(NOME_TIPO) as TipoCamera[]).map((t) => (
            <label
              key={t}
              className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 bg-white px-4 py-3 ${tipo === t ? "border-marca" : "border-linha"}`}
            >
              <input type="radio" name="tipo" className="mt-1 h-5 w-5 accent-[var(--marca)]" checked={tipo === t} onChange={() => setTipo(t)} />
              <span>
                <span className="block text-base font-bold text-tinta">{NOME_TIPO[t].titulo}</span>
                <span className="block text-sm text-tinta-suave">{NOME_TIPO[t].texto}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {tipo === "app_fabricante" && (
          <Campo rotulo="Link do app ou da nuvem" type="url" inputMode="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        )}
        {gateway && (
          <>
            <Campo
              rotulo="Endereço do gateway"
              type="url"
              inputMode="url"
              placeholder="https://cameras.seulavarapido.com.br"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              ajuda="Endereço do túnel seguro (Cloudflare). Nunca o IP do DVR."
            />
            <Campo
              rotulo={tipo === "hls" ? "Caminho do vídeo" : "Caminho da imagem"}
              placeholder={tipo === "hls" ? "box1/index.m3u8" : "api/frame.jpeg?src=box1"}
              value={caminho}
              onChange={(e) => setCaminho(e.target.value)}
              maxLength={300}
            />
            <Campo
              rotulo="Token do gateway"
              type="password"
              autoComplete="new-password"
              placeholder={camera?.tem_token ? "•••••• (guardado — deixe em branco para manter)" : "Opcional"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={apagarToken}
              ajuda="Fica só no servidor. Nem você consegue ver de novo depois de salvar."
            />
            {camera?.tem_token && <Interruptor rotulo="Apagar o token guardado" ligado={apagarToken} onChange={setApagarToken} />}
          </>
        )}
        <fieldset className="flex flex-col gap-3 rounded-2xl border-2 border-linha bg-white p-4">
          <legend className="px-1 text-base font-bold text-tinta">Sensor de movimento</legend>
          <p className="text-sm text-tinta-suave">
            Só funciona se a câmera ou o DVR tiver detecção de movimento ligada. Avisa no seu celular quando a área fica parada, só no
            horário de funcionamento.
          </p>
          <Interruptor rotulo="Avisar quando ficar sem movimento" ligado={monitorar} onChange={setMonitorar} />
          {monitorar && (
            <>
              <Campo
                rotulo="Avisar depois de quantos minutos parado"
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
              {tipo === "demonstracao" ? (
                <p className="text-sm text-tinta-suave">Na câmera de demonstração o sensor é simulado: use “Simular movimento” no histórico.</p>
              ) : !camera ? (
                <p className="text-sm text-tinta-suave">Depois de salvar aparece o endereço para colocar no gateway da loja.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-tinta">Endereço do sensor (para o técnico colocar no gateway/DVR)</p>
                  <code className="break-all rounded-lg bg-fundo px-3 py-2 text-sm text-tinta">{enderecoSensor}</code>
                  <div className="grid grid-cols-2 gap-2">
                    <Botao
                      type="button"
                      variante="secundario"
                      onClick={() => navigator.clipboard?.writeText(enderecoSensor).then(() => setCopiado(true), () => {})}
                    >
                      {copiado ? "Copiado ✓" : "Copiar"}
                    </Botao>
                    <Botao type="button" variante="fantasma" onClick={novaChave}>
                      Gerar novo
                    </Botao>
                  </div>
                  <p className="text-sm text-tinta-suave">É secreto: quem tiver esse endereço consegue mandar sinais de movimento.</p>
                </div>
              )}
            </>
          )}
        </fieldset>
        <Campo rotulo="Posição na tela (opcional)" type="number" inputMode="numeric" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
        <Interruptor rotulo="Câmera ligada" ligado={ativo} onChange={setAtivo} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={salvando}>
          Salvar
        </Botao>
        {camera &&
          (excluir ? (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3">
              <p className="text-base text-red-800">Excluir a câmera “{camera.nome}”?</p>
              <div className="grid grid-cols-2 gap-2">
                <Botao type="button" variante="secundario" onClick={() => setExcluir(false)}>
                  Não
                </Botao>
                <Botao type="button" variante="perigo" carregando={salvando} onClick={confirmarExclusao}>
                  Excluir
                </Botao>
              </div>
            </div>
          ) : (
            <Botao type="button" variante="fantasma" largo onClick={() => setExcluir(true)}>
              Excluir câmera
            </Botao>
          ))}
      </form>
    </Folha>
  );
}
