// Peças da identidade DNM&LTDA: rodapé com o logo e a cena do carro com bolhas.
// O logo é sempre a imagem oficial (public/logo-dnm*.webp), nunca redesenhado.

export function RodapeDNM({ discreto }: { discreto?: boolean }) {
  if (discreto) {
    return (
      <p className="text-xs font-semibold tracking-wide opacity-70">
        Developed by DNM<span className="font-[system-ui]">&amp;</span>LTDA Technology
      </p>
    );
  }
  return (
    <footer className="px-4 pb-6 pt-4 text-center">
      <div className="filete-dourado mx-auto mb-4 max-w-xs" aria-hidden="true" />
      <img src="/logo-dnm-marca.webp" alt="DNM&LTDA" width={120} height={63} className="mx-auto h-auto w-[120px] rounded-lg" />
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-dourado-escuro">
        Developed by DNM<span className="font-[system-ui]">&amp;</span>LTDA Technology
      </p>
    </footer>
  );
}

const BOLHAS = [
  { left: "8%", size: 10, dur: 7, atraso: 0, x: 10, altura: 150 },
  { left: "18%", size: 6, dur: 6, atraso: 2.2, x: -6, altura: 120 },
  { left: "30%", size: 14, dur: 8.5, atraso: 1, x: 14, altura: 170 },
  { left: "46%", size: 8, dur: 6.5, atraso: 3.4, x: -10, altura: 140 },
  { left: "62%", size: 12, dur: 7.5, atraso: 0.6, x: 8, altura: 160 },
  { left: "74%", size: 7, dur: 6, atraso: 2.8, x: -8, altura: 130 },
  { left: "86%", size: 11, dur: 8, atraso: 1.6, x: 6, altura: 155 },
  { left: "94%", size: 6, dur: 7, atraso: 4, x: -4, altura: 110 },
];

/** Bolhas douradas subindo, para ficar atrás de um conteúdo (o pai precisa de relative + overflow-hidden). */
export function Bolhas() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {BOLHAS.map((b, i) => (
        <span
          key={i}
          className="bolha"
          style={
            {
              left: b.left,
              width: b.size,
              height: b.size,
              "--dur": `${b.dur}s`,
              "--atraso": `${b.atraso}s`,
              "--x": `${b.x}px`,
              "--altura": `${b.altura}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Carro em 3D (desenho próprio, não é o logo) flutuando, com brilho de recém-lavado. */
export function Carro3D({ className = "h-16 w-28" }: { className?: string }) {
  return (
    <span className="palco-3d inline-block" aria-hidden="true">
      <svg viewBox="0 0 160 84" className={`carro-3d block ${className}`}>
        <defs>
          <linearGradient id="dnm-lataria" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b63d9" />
            <stop offset="0.45" stopColor="#1e40af" />
            <stop offset="1" stopColor="#0a1f4d" />
          </linearGradient>
          <linearGradient id="dnm-vidro" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#dfe8ff" />
            <stop offset="0.55" stopColor="#7d96d6" />
            <stop offset="1" stopColor="#13285e" />
          </linearGradient>
          <radialGradient id="dnm-roda" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#f3d27a" />
            <stop offset="0.45" stopColor="#b8862b" />
            <stop offset="0.5" stopColor="#1b1b1b" />
            <stop offset="1" stopColor="#0d0d0d" />
          </radialGradient>
        </defs>
        <ellipse cx="80" cy="78" rx="64" ry="5" fill="#0a1f4d" opacity="0.22" />
        <path
          d="M14 58 C14 48 20 44 32 42 L50 40 L64 26 C68 22 74 20 82 20 L104 20 C112 20 117 23 122 28 L134 40 L144 43 C150 45 152 49 152 54 L152 60 C152 63 150 65 147 65 L18 65 C15 65 14 62 14 58 Z"
          fill="url(#dnm-lataria)"
        />
        <path d="M58 40 L69 28 C72 25 76 24 81 24 L92 24 L92 40 Z" fill="url(#dnm-vidro)" />
        <path d="M97 24 L104 24 C110 24 114 26 118 30 L127 40 L97 40 Z" fill="url(#dnm-vidro)" />
        <path d="M24 47 C40 44 110 43 146 47" stroke="#e5b339" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M34 44 C60 41 100 41 128 43" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <rect x="140" y="49" width="9" height="4" rx="2" fill="#fde68a" />
        <rect x="15" y="50" width="6" height="4" rx="2" fill="#f87171" />
        <circle cx="44" cy="65" r="11" fill="url(#dnm-roda)" />
        <circle cx="122" cy="65" r="11" fill="url(#dnm-roda)" />
        <circle cx="44" cy="65" r="3" fill="#e5b339" />
        <circle cx="122" cy="65" r="3" fill="#e5b339" />
        <path d="M108 15 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" fill="#e5b339" />
        <path d="M60 12 l1.4 2.8 2.8 1.4 -2.8 1.4 -1.4 2.8 -1.4 -2.8 -2.8 -1.4 2.8 -1.4z" fill="#f3d27a" />
      </svg>
    </span>
  );
}

/** Faixa de topo: carro 3D + bolhas douradas (tela inicial e agendamento). */
export function CenaLavagem({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="cabecalho-dnm relative overflow-hidden rounded-3xl px-5 py-5">
      <Bolhas />
      <div className="relative flex items-center gap-4">
        <Carro3D className="h-16 w-28 shrink-0" />
        <div className="min-w-0">
          <p className="titulo-dnm text-xl font-black leading-tight">{titulo}</p>
          {texto && <p className="mt-1 text-sm text-white/85">{texto}</p>}
        </div>
      </div>
    </div>
  );
}
