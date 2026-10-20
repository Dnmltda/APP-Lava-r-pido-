import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Botao, Campo, Carregando, EstadoErro, EstadoVazio, Folha, Girador, Interruptor } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { mensagemDeErro, pb } from "../lib/pb";
import { pode } from "../lib/permissoes";
import type { Camera, TipoCamera } from "../lib/tipos";

// ETAPA 7 — Câmeras (só o patrão). O app nunca recebe o endereço nem o token do
// gateway: pede um passe de 10 minutos e a imagem/vídeo passa pelo servidor.

const NOME_TIPO: Record<TipoCamera, { titulo: string; texto: string }> = {
  imagem: { titulo: "Imagem ao vivo", texto: "Foto atualizada a cada segundo (go2rtc). Funciona em qualquer celular." },
  hls: { titulo: "Vídeo ao vivo", texto: "Vídeo HLS do gateway (MediaMTX/go2rtc). Gasta mais internet." },
  app_fabricante: { titulo: "App do fabricante", texto: "Botão que abre o app ou a nuvem da câmera (Intelbras, Hikvision…)." },
  demonstracao: { titulo: "Demonstração", texto: "Imagem de teste gerada pelo servidor, para ver a tela funcionando." },
};
const RENOVAR_PASSE_MS = 8 * 60 * 1000;

export function Cameras() {
  const { empresa, vinculo } = useEmpresa();
  const [lista, setLista] = useState<Camera[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Camera | "nova" | null>(null);
  const [ampliada, setAmpliada] = useState<Camera | null>(null);

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
  }, [carregar]);

  if (!pode(vinculo, "cameras")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Câmeras">
      <p className="text-base text-tinta-suave">Só você (patrão) vê esta tela. Cada vez que abre, fica registrado no histórico.</p>
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
          lista.map((c) => <CartaoCamera key={c.id} camera={c} onEditar={() => setEditando(c)} onAmpliar={() => setAmpliada(c)} />)
        )}
      </div>
      <Botao largo variante="secundario" className="mt-5" onClick={() => setEditando("nova")}>
        + Nova câmera
      </Botao>
      <details className="mt-5 rounded-2xl border border-linha bg-white p-4 text-base text-tinta">
        <summary className="cursor-pointer font-bold">Como ligar as câmeras do DVR</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-tinta-suave">
          <li>O jeito mais fácil: use o botão do app do fabricante (Intelbras, Hikvision…).</li>
          <li>
            Para ver dentro deste app: um computadorzinho na loja (gateway go2rtc ou MediaMTX) lê as câmeras e um túnel seguro
            (Cloudflare) cria um endereço https://. Cadastre aqui esse endereço e o token.
          </li>
          <li>Nunca abra a porta do DVR na internet. Peça ajuda ao técnico — o passo a passo está no guia do sistema.</li>
        </ol>
      </details>
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

function CartaoCamera({ camera, onEditar, onAmpliar }: { camera: Camera; onEditar: () => void; onAmpliar: () => void }) {
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
        <Botao variante="fantasma" onClick={onEditar}>
          Editar
        </Botao>
      </div>
    </div>
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
    const dados: Record<string, unknown> = {
      empresa: empresaId,
      nome: nome.trim(),
      tipo_integracao: tipo,
      endereco_stream: gateway ? endereco.trim() : "",
      caminho: gateway ? caminho.trim() : "",
      link_app: tipo === "app_fabricante" ? link.trim() : "",
      ordem: parseInt(ordem, 10) || 0,
      ativo,
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
