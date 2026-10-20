import type { Empresa, Servico, TipoVeiculo } from "../lib/tipos";

export function tiposDaEmpresa(empresa: Empresa): TipoVeiculo[] {
  return Array.isArray(empresa.tipos_veiculo) ? empresa.tipos_veiculo : [];
}

export function precoPara(servico: Servico, tipoId?: string) {
  const p = tipoId ? servico.precos_tipo?.[tipoId] : undefined;
  return typeof p === "number" ? p : servico.preco;
}

// Escolha do tipo de veículo em chips grandes (toque com a mão molhada).
export function EscolhaTipo({
  tipos,
  valor,
  onChange,
  rotulo = "Tipo do veículo",
  semTipo = "Não sei / padrão",
}: {
  tipos: TipoVeiculo[];
  valor: string;
  onChange: (id: string) => void;
  rotulo?: string;
  semTipo?: string;
}) {
  if (!tipos.length) return null;
  const opcoes = [{ id: "", nome: semTipo, restrito: false }, ...tipos];
  return (
    <fieldset>
      <legend className="mb-2 text-base font-bold text-tinta">{rotulo}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((t) => (
          <button
            key={t.id || "padrao"}
            type="button"
            role="radio"
            aria-checked={valor === t.id}
            onClick={() => onChange(t.id)}
            className={`min-h-11 rounded-full border-2 px-4 text-base font-bold ${valor === t.id ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
          >
            {t.nome}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
