// Notas de 1 a 5 estrelas. Botões grandes (48 px) e acessíveis (grupo de rádio).
export function EscolherEstrelas({ rotulo, valor, onChange }: { rotulo: string; valor: number; onChange: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-base font-bold text-tinta">{rotulo}</legend>
      <div className="flex gap-1" role="radiogroup" aria-label={rotulo}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)}
            className={`flex h-12 w-12 items-center justify-center rounded-xl text-3xl leading-none ${n <= valor ? "text-amber-500" : "text-gray-300"}`}
          >
            ★
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function MostrarEstrelas({ nota, rotulo }: { nota: number; rotulo?: string }) {
  const cheia = Math.round(nota);
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rotulo ? rotulo + ": " : ""}${nota} de 5`}>
      <span className="text-amber-500" aria-hidden="true">
        {"★".repeat(cheia)}
        <span className="text-gray-300">{"★".repeat(5 - cheia)}</span>
      </span>
      <span className="text-sm font-bold text-tinta">{nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
    </span>
  );
}
