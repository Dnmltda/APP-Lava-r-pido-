import type { Vinculo } from "./tipos";

// Espelho da tabela 1.3 do planejamento, usado só para mostrar/esconder telas.
// A proteção de verdade está nas regras de API do PocketBase.
export type Acao =
  | "ver_fila_completa"
  | "gerenciar_fila"
  | "ver_valores"
  | "gerenciar_equipe"
  | "configurar_empresa"
  | "cameras"
  | "ver_auditoria";

export function pode(v: Vinculo | null | undefined, acao: Acao): boolean {
  if (!v || !v.ativo) return false;
  const equipe = v.papel !== "cliente";
  switch (acao) {
    case "ver_fila_completa":
      return equipe;
    case "gerenciar_fila":
      return v.papel === "patrao" || v.papel === "gerente" || (v.papel === "funcionario" && v.responsavel_fila);
    case "ver_valores":
      return v.papel === "patrao" || v.papel === "gerente";
    case "gerenciar_equipe":
    case "configurar_empresa":
    case "cameras":
    case "ver_auditoria":
      return v.papel === "patrao";
  }
}
