// Tabela de referência para um lava rápido começar (o dono ajusta tudo depois).
// Preços: ponto médio das faixas nacionais de 2026 publicadas em
// https://lavagemdeouro.com/tabela-de-precos-lava-car-2026/ (arredondado para múltiplos de 5).
// Tempos: mesma fonte e https://www.carpass.in/blog/tabela-de-precos-para-lava-rapido;
// onde as fontes não trazem tempo, é estimativa e vem marcada no fim da linha.
// Moto fica de fora: nenhuma fonte confiável de preço.

export const TIPOS_PADRAO = [
  { nome: "Carro pequeno (hatch)", restrito: false },
  { nome: "Sedan / SUV", restrito: false },
  { nome: "Caminhonete / Van", restrito: false },
] as const;

// precos = [pequeno, sedan/SUV, caminhonete/van]; o preço padrão do serviço é o do carro pequeno.
export const SERVICOS_PADRAO: { nome: string; descricao: string; minutos: number; precos: [number, number, number] }[] = [
  { nome: "Ducha", descricao: "Lavagem rápida por fora", minutos: 15, precos: [30, 40, 50] },
  { nome: "Lavagem simples", descricao: "Por fora + aspiração", minutos: 30, precos: [45, 60, 75] },
  { nome: "Lavagem completa", descricao: "Por dentro e por fora", minutos: 60, precos: [75, 100, 125] },
  { nome: "Lavagem completa + cera", descricao: "Completa com cera na pintura", minutos: 90, precos: [110, 135, 170] }, // tempo estimado
  { nome: "Lavagem de motor", descricao: "Limpeza do motor", minutos: 45, precos: [115, 140, 170] },
  { nome: "Cristalização de vidros", descricao: "Repelente de água nos vidros", minutos: 60, precos: [80, 95, 120] }, // tempo estimado
  { nome: "Higienização interna", descricao: "Bancos, carpete e teto com extratora", minutos: 150, precos: [160, 200, 275] },
];
