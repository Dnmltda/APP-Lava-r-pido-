import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

// Componentes base. Pensados para uso em pé, com a mão molhada e no sol:
// alvos de toque ≥ 48 px, texto ≥ 16 px, alto contraste.

type VarianteBotao = "primario" | "secundario" | "perigo" | "fantasma";

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  primario: "bg-marca text-sobre-marca hover:bg-marca-forte active:bg-marca-forte",
  secundario: "bg-white text-tinta border-2 border-linha hover:border-tinta-suave",
  perigo: "bg-red-700 text-white hover:bg-red-800",
  fantasma: "bg-transparent text-marca-forte hover:bg-marca-suave",
};

export function Botao({
  variante = "primario",
  carregando = false,
  largo = false,
  className = "",
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao; carregando?: boolean; largo?: boolean }) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ESTILO_BOTAO[variante]} ${largo ? "w-full" : ""} ${className}`}
    >
      {carregando && <Girador />}
      {children}
    </button>
  );
}

export function Girador({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Campo({
  rotulo,
  ajuda,
  erro,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; ajuda?: string; erro?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold text-tinta">
        {rotulo}
      </label>
      <input
        id={id}
        {...resto}
        aria-invalid={!!erro}
        className={`min-h-12 rounded-xl border-2 bg-white px-4 text-base text-tinta placeholder:text-tinta-suave/70 focus:border-marca focus:outline-none ${erro ? "border-red-600" : "border-linha"} ${resto.className || ""}`}
      />
      {ajuda && !erro && <p className="text-sm text-tinta-suave">{ajuda}</p>}
      {erro && <p className="text-sm font-semibold text-red-700">{erro}</p>}
    </div>
  );
}

export function Interruptor({
  rotulo,
  descricao,
  ligado,
  onChange,
  disabled,
}: {
  rotulo: string;
  descricao?: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border-2 border-linha bg-white px-4 py-3 text-left disabled:opacity-50"
    >
      <span>
        <span className="block text-base font-semibold text-tinta">{rotulo}</span>
        {descricao && <span className="block text-sm text-tinta-suave">{descricao}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${ligado ? "bg-marca" : "bg-gray-300"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${ligado ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "sucesso" | "info"; children: ReactNode }) {
  const estilo = {
    erro: "border-red-300 bg-red-50 text-red-800",
    sucesso: "border-green-300 bg-green-50 text-green-800",
    info: "border-marca/30 bg-marca-suave text-tinta",
  }[tipo];
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-xl border-2 px-4 py-3 text-base ${estilo}`}>
      {children}
    </div>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-linha bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-tinta-suave" role="status">
      <Girador className="h-8 w-8 text-marca" />
      <p className="text-base">{texto}</p>
    </div>
  );
}

export function EstadoVazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-linha px-6 py-10 text-center">
      <p className="text-lg font-bold text-tinta">{titulo}</p>
      {texto && <p className="text-base text-tinta-suave">{texto}</p>}
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

export function EstadoErro({ texto, tentar }: { texto: string; tentar?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-lg font-bold text-tinta">Não deu para carregar</p>
      <p className="text-base text-tinta-suave">{texto}</p>
      {tentar && (
        <Botao variante="secundario" onClick={tentar}>
          Tentar de novo
        </Botao>
      )}
    </div>
  );
}

// Ações que apagam, desativam ou cancelam sempre pedem confirmação.
export function Confirmar({
  aberto,
  titulo,
  texto,
  rotuloConfirmar,
  perigo,
  carregando,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  texto?: string;
  rotuloConfirmar: string;
  perigo?: boolean;
  carregando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!aberto) return null;
  return (
    <Folha titulo={titulo} onFechar={onCancelar}>
      {texto && <p className="text-base text-tinta-suave">{texto}</p>}
      <div className="mt-5 flex flex-col gap-3">
        <Botao variante={perigo ? "perigo" : "primario"} largo carregando={carregando} onClick={onConfirmar}>
          {rotuloConfirmar}
        </Botao>
        <Botao variante="secundario" largo onClick={onCancelar} disabled={carregando}>
          Voltar
        </Botao>
      </div>
    </Folha>
  );
}

// Folha que sobe de baixo (mobile) / janela centralizada (telas maiores).
export function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-fundo p-5 pb-8 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-extrabold text-tinta">{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="-m-2 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-tinta-suave hover:bg-black/5">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BannerSemInternet() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 bg-gray-900 px-4 py-2 text-center text-base font-semibold text-white">
      Sem internet. As informações podem estar desatualizadas.
    </div>
  );
}
