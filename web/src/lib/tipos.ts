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
  textos_aviso: { confirmada?: string; aviso_vez?: string; pronto?: string; avaliacao?: string } | null;
  horario_funcionamento: DiaFuncionamento[] | null;
  comissao_ativa: boolean;
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

export type StatusFila =
  | "pendente"
  | "confirmado"
  | "avisado"
  | "no_local"
  | "lavando"
  | "pronto"
  | "finalizado"
  | "recusado"
  | "cancelado"
  | "substituido";

export interface Servico extends Base {
  empresa: string;
  nome: string;
  descricao: string;
  preco: number;
  duracao_media_min: number;
  ordem_exibicao: number;
  ativo: boolean;
}

export interface Veiculo extends Base {
  cliente: string;
  placa: string;
  final_placa: string;
  modelo: string;
  cor: string;
  ativo: boolean;
}

export type TipoComissao = "nenhuma" | "fixo" | "percentual";
export type FormaPagamento = "cartao" | "dinheiro" | "pix";
export type StatusVenda = "aberta" | "fechada" | "corrigida" | "descartada";

export const NOME_PAGAMENTO: Record<FormaPagamento, string> = {
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  pix: "Pix na maquininha",
};

export interface Produto extends Base {
  empresa: string;
  nome: string;
  descricao: string;
  foto: string;
  preco: number;
  estoque: number;
  estoque_minimo: number;
  comissao_tipo: TipoComissao;
  comissao_valor: number;
  ativo: boolean;
}

// O que o cliente vê (rota /api/lr/catalogo): sem estoque nem comissão.
export interface ProdutoCatalogo {
  id: string;
  collectionId: string;
  nome: string;
  descricao: string;
  preco: number;
  foto: string;
  disponivel: boolean;
}

export interface ItemPedido extends Base {
  empresa: string;
  entrada: string;
  produto: string;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  status: "pendente" | "separado" | "em_falta";
  expand?: { produto?: Produto };
}

export interface Venda extends Base {
  empresa: string;
  funcionario: string;
  entrada: string;
  forma_pagamento: FormaPagamento | "";
  total: number;
  comissao_total: number;
  status: StatusVenda;
  fechada_em: string;
  corrigida_em: string;
  motivo_correcao: string;
  expand?: { funcionario?: Usuario; entrada?: { id: string; nome_avulso: string; final_placa_avulsa: string } };
}

export interface VendaItem extends Base {
  venda: string;
  produto: string;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  comissao_calculada: number;
}

export interface LancamentoCaixa extends Base {
  empresa: string;
  data: string;
  tipo: "entrada" | "saida";
  categoria: string;
  valor: number;
  descricao: string;
  criado_por: string;
  cancelado: boolean;
  expand?: { criado_por?: Usuario };
}

export interface Meta extends Base {
  empresa: string;
  periodo: "dia" | "mes";
  valor: number;
}

export interface RegraBonus extends Base {
  empresa: string;
  valor_por_carro: number;
  ativo: boolean;
}

export interface Vale extends Base {
  empresa: string;
  funcionario: string;
  valor: number;
  data: string;
  comprovante: string;
  observacao: string;
  lancado_por: string;
  cancelado: boolean;
}

export interface Holerite extends Base {
  empresa: string;
  funcionario: string;
  competencia: string;
  arquivo: string;
}

export interface DadosPainel {
  periodo: { de: string; ate: string };
  carros_lavados: number;
  faturamento: { servicos: number; produtos: number; total: number };
  caixa: { entradas: number; saidas: number; gastos_por_categoria: Record<string, number> };
  saldo: number;
  por_forma_pagamento: Record<FormaPagamento, number>;
  ranking_funcionarios: { usuario: string; nome: string; vendas_total: number; vendas_qtd: number; carros: number }[];
  ranking_produtos: { nome: string; quantidade: number; total: number }[];
  estoque_baixo: { id: string; nome: string; estoque: number; minimo: number }[];
  fila_agora: { esperando: number; pendentes: number; lavando: number; prontos: number; clientes_atrasados: number };
  atrasos: { total: number; media_min: number; lista: { id: string; minutos: number; previsto: string; inicio: string; reserva: boolean }[] };
  metas: { dia: number; mes: number; realizado_dia: number; realizado_mes: number };
}

export interface DadosArea {
  usuario: string;
  mes: { de: string; ate: string };
  carros: { hoje: number; semana: number; mes: number };
  vendas: { quantidade: number; total: number; comissao: number };
  bonus: { valor_por_carro: number; por_carros: number; comissao: number; estimado: number };
  vales: { quantidade: number; total: number };
  saldo_estimado: number;
}
