import { Campo } from "./ui";
import { normalizarPlaca } from "../lib/formato";
import { PORTES, sugerirPorte } from "../lib/porteVeiculo";
import type { Porte } from "../lib/tipos";

export interface DadosVeiculo {
  semPlaca: boolean; // true = só os 3 últimos caracteres
  placa: string;
  final_placa: string;
  modelo: string;
  cor: string;
  porte: Porte | "";
  porteManual: boolean; // o cliente escolheu: o modelo não muda mais a sugestão
  app_motorista: boolean;
}

export const VEICULO_VAZIO: DadosVeiculo = { semPlaca: false, placa: "", final_placa: "", modelo: "", cor: "", porte: "", porteManual: false, app_motorista: false };

export function validarVeiculo(v: DadosVeiculo): Record<string, string> {
  const erros: Record<string, string> = {};
  if (v.semPlaca) {
    if (!/^[A-Z0-9]{3}$/.test(v.final_placa)) erros.final_placa = "Digite os 3 últimos caracteres da placa.";
  } else if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v.placa)) {
    erros.placa = "Placa inválida. Ex.: ABC1D23 ou ABC1234.";
  }
  if (!v.porte) erros.porte = "Escolha o tamanho do veículo.";
  return erros;
}

export function corpoVeiculo(v: DadosVeiculo) {
  const extra = { modelo: v.modelo.trim(), cor: v.cor.trim(), porte: v.porte, app_motorista: v.porte !== "moto" && v.app_motorista };
  return v.semPlaca ? { placa: "", final_placa: v.final_placa, ...extra } : { placa: v.placa, final_placa: v.placa.slice(-3), ...extra };
}

export function CamposVeiculo({
  valor,
  onChange,
  erros = {},
}: {
  valor: DadosVeiculo;
  onChange: (v: DadosVeiculo) => void;
  erros?: Record<string, string>;
}) {
  const mudar = (p: Partial<DadosVeiculo>) => onChange({ ...valor, ...p });
  return (
    <div className="flex flex-col gap-4">
      {valor.semPlaca ? (
        <Campo
          rotulo="3 últimos caracteres da placa"
          autoCapitalize="characters"
          placeholder="D23"
          maxLength={3}
          value={valor.final_placa}
          onChange={(e) => mudar({ final_placa: normalizarPlaca(e.target.value).slice(0, 3) })}
          erro={erros.final_placa}
          ajuda="É o que aparece na fila para você se reconhecer."
        />
      ) : (
        <Campo
          rotulo="Placa"
          autoCapitalize="characters"
          placeholder="ABC1D23"
          value={valor.placa}
          onChange={(e) => mudar({ placa: normalizarPlaca(e.target.value) })}
          erro={erros.placa}
          ajuda="Na fila pública só aparecem os 3 últimos caracteres."
        />
      )}
      <button
        type="button"
        onClick={() => mudar({ semPlaca: !valor.semPlaca })}
        className="-mt-2 self-start text-base font-semibold text-marca-forte underline underline-offset-4"
      >
        {valor.semPlaca ? "Prefiro informar a placa completa" : "Prefiro informar só os 3 últimos"}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo="Modelo"
          placeholder="Onix"
          value={valor.modelo}
          onChange={(e) => mudar({ modelo: e.target.value, ...(valor.porteManual ? {} : { porte: sugerirPorte(e.target.value) }) })}
        />
        <Campo rotulo="Cor" placeholder="Prata" value={valor.cor} onChange={(e) => mudar({ cor: e.target.value })} />
      </div>
      <TamanhoVeiculo valor={valor.porte} onChange={(porte) => mudar({ porte, porteManual: true })} erro={erros.porte} />
      {valor.porte !== "moto" && <AppMotorista valor={valor.app_motorista} onChange={(app_motorista) => mudar({ app_motorista })} />}
    </div>
  );
}

export function TamanhoVeiculo({ valor, onChange, erro }: { valor: Porte | ""; onChange: (p: Porte) => void; erro?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-base font-bold text-tinta">Tamanho do veículo</legend>
      <p className="mb-2 text-sm text-tinta-suave">O preço do serviço sai por aqui. Já sugerimos pelo modelo; confira.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tamanho do veículo">
        {PORTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={valor === p.id}
            onClick={() => onChange(p.id)}
            className={`min-h-14 rounded-xl border-2 px-3 py-1 text-left ${valor === p.id ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
          >
            <span className="block text-base font-bold text-tinta">{p.nome}</span>
            {p.exemplos && <span className="block text-xs text-tinta-suave">{p.exemplos}</span>}
          </button>
        ))}
      </div>
      {erro && <p className="mt-1 text-sm font-semibold text-red-700">{erro}</p>}
    </fieldset>
  );
}

export function AppMotorista({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-linha bg-white px-4 py-2">
      <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--marca)]" checked={valor} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-base font-semibold text-tinta">Trabalho com este carro em aplicativo</span>
        <span className="block text-sm text-tinta-suave">Uber, 99 e outros. Se o lava rápido tiver preço para motorista de app, ele já vale.</span>
      </span>
    </label>
  );
}
