import { useEffect, useState } from "react";
import { useSessao } from "../contexto/Sessao";
import { mensagemDeErro } from "../lib/pb";
import { appInstalado, ativarAvisos, ehIPhone, estadoAvisos, type EstadoAvisos } from "../lib/push";
import { Aviso, Botao } from "./ui";

// Evento do Android/Chrome para instalar o PWA com um toque.
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let eventoInstalar: EventoInstalar | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e as EventoInstalar;
});

// Cartão para o cliente ligar os avisos ("sua vez foi confirmada", "já pode vir"…).
export function AtivarAvisos() {
  const { usuario } = useSessao();
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [podeInstalar, setPodeInstalar] = useState(!!eventoInstalar && !appInstalado());

  useEffect(() => {
    estadoAvisos().then(setEstado).catch(() => setEstado("sem_suporte"));
    const aoPoder = () => setPodeInstalar(!appInstalado());
    window.addEventListener("beforeinstallprompt", aoPoder);
    return () => window.removeEventListener("beforeinstallprompt", aoPoder);
  }, []);

  if (!estado || !usuario) return null;

  async function ativar() {
    setOcupado(true);
    setErro("");
    try {
      setEstado(await ativarAvisos(usuario!.id));
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível ativar os avisos neste celular."));
    } finally {
      setOcupado(false);
    }
  }

  async function instalar() {
    if (!eventoInstalar) return;
    await eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    setPodeInstalar(false);
  }

  const instalarBotao = podeInstalar && (
    <Botao variante="secundario" largo className="mt-3" onClick={instalar}>
      Instalar o app no celular
    </Botao>
  );

  if (estado === "ligado") {
    return instalarBotao ? <div>{instalarBotao}</div> : (
      <p className="text-center text-sm font-semibold text-tinta-suave">🔔 Avisos ativados neste celular</p>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-marca bg-marca-suave p-4">
      <p className="text-lg font-extrabold text-tinta">🔔 Receba os avisos no celular</p>
      <p className="mt-1 text-base text-tinta">“Sua vez foi confirmada”, “Já pode vir” e “Seu carro está pronto”.</p>
      {estado === "instalar_iphone" ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-base text-tinta">
          <li>
            Toque em <strong>Compartilhar</strong> <span aria-hidden="true">(□↑)</span> no Safari.
          </li>
          <li>
            Escolha <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li>Abra o app pelo ícone novo e toque em “Ativar avisos”.</li>
        </ol>
      ) : estado === "negado" ? (
        <p className="mt-3 text-base text-tinta">
          Os avisos estão bloqueados. Libere nas configurações do navegador (Notificações → permitir para este site).
        </p>
      ) : estado === "sem_suporte" ? (
        <p className="mt-3 text-base text-tinta">Este navegador não recebe avisos. Use o Chrome (Android) ou instale o app no iPhone.</p>
      ) : (
        <Botao largo className="mt-3" carregando={ocupado} onClick={ativar}>
          Ativar avisos
        </Botao>
      )}
      {instalarBotao}
      {erro && (
        <div className="mt-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}
    </div>
  );
}

// Cartão "Instalar o app": celular (Android/iPhone) e computador (Chrome/Edge).
// Some quando o app já está aberto instalado.
export function InstalarApp() {
  const [pode, setPode] = useState(!!eventoInstalar);
  const [instalado, setInstalado] = useState(appInstalado());
  useEffect(() => {
    const aoPoder = () => setPode(true);
    const aoInstalar = () => setInstalado(true);
    window.addEventListener("beforeinstallprompt", aoPoder);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoder);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);
  if (instalado) return null;

  async function instalar() {
    if (!eventoInstalar) return;
    await eventoInstalar.prompt();
    const { outcome } = await eventoInstalar.userChoice;
    eventoInstalar = null;
    setPode(false);
    if (outcome === "accepted") setInstalado(true);
  }

  const celular = /android|iphone|ipad|ipod/i.test(navigator.userAgent) || ehIPhone();
  return (
    <section className="rounded-2xl border-2 border-marca bg-marca-suave p-4" aria-labelledby="titulo-instalar">
      <h2 id="titulo-instalar" className="text-lg font-extrabold text-tinta">
        📲 Instalar o app {celular ? "no celular" : "no computador"}
      </h2>
      <p className="mt-1 text-base text-tinta">Fica com ícone próprio, abre direto no seu lava rápido e sem a barra do navegador.</p>
      {pode ? (
        <Botao largo className="mt-3" onClick={instalar}>
          Instalar o app
        </Botao>
      ) : ehIPhone() ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-base text-tinta">
          <li>
            Abra este endereço no <strong>Safari</strong>.
          </li>
          <li>
            Toque em <strong>Compartilhar</strong> <span aria-hidden="true">(□↑)</span>.
          </li>
          <li>
            Escolha <strong>Adicionar à Tela de Início</strong>.
          </li>
        </ol>
      ) : celular ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-base text-tinta">
          <li>
            Abra este endereço no <strong>Chrome</strong> (ou no navegador Samsung).
          </li>
          <li>
            Toque no menu <strong>⋮</strong> (ou <strong>≡</strong>).
          </li>
          <li>
            Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
          </li>
        </ol>
      ) : (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-base text-tinta">
          <li>
            Abra este endereço no <strong>Chrome</strong> ou no <strong>Edge</strong>.
          </li>
          <li>
            Clique no ícone de instalar na barra de endereço <span aria-hidden="true">(⊕ ou 🖥️)</span>, ou no menu <strong>⋮</strong> →{" "}
            <strong>Instalar</strong>.
          </li>
          <li>O app aparece no menu Iniciar e na área de trabalho.</li>
        </ol>
      )}
    </section>
  );
}
