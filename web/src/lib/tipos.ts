export type Papel = "patrao" | "gerente" | "funcionario" | "cliente";

export interface Base {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
}

export interface DiaFuncionamento {
  aberto: boolean;
  abre: string; // "08:00"
  fecha: string; // "18:00"
}

export interface Empresa extends Base {
  nome: string;
  slug: string;
  logo: string;
  cor_principal: string;
  whatsapp: string;
  endereco: string;
  capacidade_simultanea: number;
  tolerancia_min: number;
  aviso_min: number;
  textos_aviso: { aviso_vez?: string } | null;
  horario_funcionamento: DiaFuncionamento[] | null;
  ativo: boolean;
}

export interface Usuario extends Base {
  nome: string;
  celular: string;
  aceite_marketing: boolean;
  aceite_marketing_em: string;
}

export interface Vinculo extends Base {
  usuario: string;
  empresa: string;
  papel: Papel;
  responsavel_fila: boolean;
  ativo: boolean;
  expand?: { usuario?: Usuario; empresa?: Empresa };
}

export const NOME_PAPEL: Record<Papel, string> = {
  patrao: "Patrão",
  gerente: "Gerente",
  funcionario: "Funcionário",
  cliente: "Cliente",
};
