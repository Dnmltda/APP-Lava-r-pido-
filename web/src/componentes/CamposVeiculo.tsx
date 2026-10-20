import { Campo } from "./ui";
import { normalizarPlaca } from "../lib/formato";
import { acharModelo, textoPorte, useModelos } from "../lib/porteVeiculo";

export interface DadosVeiculo {
  semPlaca: boolean; // true = só os 3 últimos caracteres
  placa: string;
  final_placa: string;
  modelo: string;
  cor: string;
  app_motorista: boolean;
}

export const VEICULO_VAZIO: DadosVeiculo = { semPlaca: false, placa: "", final_placa: "", modelo: "", cor: "", app_motorista: false };

export function validarVeiculo(v: DadosVeiculo): Record<string, string> {
  const erros: Record<string, string> = {};
  if (v.semPlaca) {
    if (!/^[A-Z0-9]{3}$/.test(v.final_placa)) erros.final_placa = "Digite os 3 últimos caracteres da placa.";
  } else if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v.placa)) {
    erros.placa = "Placa inválida. Ex.: ABC1D23 ou ABC1234.";
  }
  if (v.modelo.trim().length < 2) erros.modelo = "Digite o modelo do carro (ex.: HB20).";
  if (v.cor.trim().length < 2) erros.cor = "Digite a cor do carro (ex.: Prata).";
  return erros;
}

export function corpoVeiculo(v: DadosVeiculo) {
  // O tamanho não vai: o servidor grava pelo modelo.
  const extra = { modelo: v.modelo.trim(), cor: v.cor.trim(), app_motorista: v.app_motorista };
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
  const modelos = useModelos();
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
      <Campo
        rotulo="Modelo do carro"
        placeholder="Ex.: HB20, Onix, Corolla, Hilux"
        list="lr-modelos"
        autoComplete="off"
        value={valor.modelo}
        erro={erros.modelo}
        onChange={(e) => mudar({ modelo: e.target.value })}
      />
      <datalist id="lr-modelos">
        {modelos.map((m) => (
          <option key={m.nome} value={m.nome} />
        ))}
      </datalist>
      <TamanhoPeloModelo modelo={valor.modelo} />
      <Campo rotulo="Cor do carro" placeholder="Ex.: Prata" maxLength={30} value={valor.cor} erro={erros.cor} onChange={(e) => mudar({ cor: e.target.value })} ajuda="A equipe usa para achar o seu carro." />
      {acharModelo(modelos, valor.modelo)?.porte !== "moto" && <AppMotorista valor={valor.app_motorista} onChange={(app_motorista) => mudar({ app_motorista })} />}
    </div>
  );
}

export function AppMotorista({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-linha bg-white px-4 py-2">
      <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--marca)]" checked={valor} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-base font-semibold text-tinta">Trabalho com este carro em aplicativo</span>
        <span className="block text-sm text-tinta-suave">
          Uber, 99 e outros. Se o lava rápido tiver preço de app, a 1ª lavagem de cada carro sai pelo preço normal: a equipe confere e, depois de aprovado, o desconto
          entra sozinho.
        </span>
      </span>
    </label>
  );
}

// O tamanho sai do modelo (o cliente não escolhe). Fora da lista: a equipe confere na 1ª lavagem.
function TamanhoPeloModelo({ modelo }: { modelo: string }) {
  const modelos = useModelos();
  if (modelo.trim().length < 2 || !modelos.length) return null;
  const achado = acharModelo(modelos, modelo);
  return achado ? (
    <p className="-mt-2 rounded-xl bg-green-50 px-4 py-3 text-base text-tinta ring-1 ring-green-200">
      <strong>{achado.nome}</strong> · {textoPorte(achado.porte)} ✓
    </p>
  ) : (
    <p className="-mt-2 rounded-xl bg-fundo px-4 py-3 text-sm text-tinta">Modelo fora da nossa lista: o lava rápido confere o tamanho na primeira lavagem.</p>
  );
}
