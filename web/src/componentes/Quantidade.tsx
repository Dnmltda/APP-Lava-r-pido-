// Seletor de quantidade com botões grandes (+ / −) para usar com a mão molhada.
export function Quantidade({
  valor,
  onChange,
  max = 99,
  rotulo,
}: {
  valor: number;
  onChange: (v: number) => void;
  max?: number;
  rotulo: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Quantidade de ${rotulo}`}>
      <button
        type="button"
        aria-label={`Menos ${rotulo}`}
        disabled={valor <= 0}
        onClick={() => onChange(Math.max(0, valor - 1))}
        className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-linha bg-white text-2xl font-bold text-tinta disabled:opacity-40"
      >
        −
      </button>
      <span className="w-8 text-center text-lg font-black text-tinta" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Mais ${rotulo}`}
        disabled={valor >= max}
        onClick={() => onChange(Math.min(max, valor + 1))}
        className="flex h-12 w-12 items-center justify-center rounded-xl bg-marca text-2xl font-bold text-sobre-marca disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
