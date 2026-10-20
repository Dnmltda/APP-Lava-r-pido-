import { Campo } from "./ui";
import { normalizarPlaca } from "../lib/formato";

export interface DadosVeiculo {
  semPlaca: boolean; // true = só os 3 últimos caracteres
  placa: string;
  final_placa: string;
  modelo: string;
  cor: string;
}

export const VEICULO_VAZIO: DadosVeiculo = { semPlaca: false, placa: "", final_placa: "", modelo: "", cor: "" };

export function validarVeiculo(v: DadosVeiculo): Record<string, string> {
  const erros: Record<string, string> = {};
  if (v.semPlaca) {
    if (!/^[A-Z0-9]{3}$/.test(v.final_placa)) erros.final_placa = "Digite os 3 últimos caracteres da placa.";
  } else if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v.placa)) {
    erros.placa = "Placa inválida. Ex.: ABC1D23 ou ABC1234.";
  }
  return erros;
}

export function corpoVeiculo(v: DadosVeiculo) {
  return v.semPlaca
    ? { placa: "", final_placa: v.final_placa, modelo: v.modelo.trim(), cor: v.cor.trim() }
    : { placa: v.placa, final_placa: v.placa.slice(-3), modelo: v.modelo.trim(), cor: v.cor.trim() };
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
        <Campo rotulo="Modelo" placeholder="Onix" value={valor.modelo} onChange={(e) => mudar({ modelo: e.target.value })} />
        <Campo rotulo="Cor" placeholder="Prata" value={valor.cor} onChange={(e) => mudar({ cor: e.target.value })} />
      </div>
    </div>
  );
}
