import type { Vinculo } from "./tipos";

// Espelho da tabela 1.3 do planejamento + acessos extras que o dono libera por pessoa,
// usado só para mostrar/esconder telas. A proteção de verdade está no servidor.
export type Acao =
  | "ver_fila_completa"
  | "gerenciar_fila"
  | "ver_valores"
  | "gerenciar_equipe"
  | "configurar_empresa"
  | "catalogo"
  | "clientes"
  | "cameras"
  | "configurar_cameras"
  | "ver_auditoria";

export function pode(v: Vinculo | null | undefined, acao: Acao): boolean {
  if (!v || !v.ativo) return false;
  const equipe = v.papel !== "cliente";
  const patrao = v.papel === "patrao";
  switch (acao) {
    case "ver_fila_completa":
      return equipe;
    case "gerenciar_fila":
      return patrao || v.papel === "gerente" || (v.papel === "funcionario" && v.responsavel_fila);
    case "ver_valores":
      return patrao || v.papel === "gerente" || (equipe && !!v.perm_valores);
    case "catalogo":
      return patrao || (equipe && !!v.perm_catalogo);
    case "clientes":
      return patrao || (equipe && !!v.perm_clientes);
    case "cameras":
      return patrao || (equipe && !!v.perm_cameras);
    case "gerenciar_equipe":
    case "configurar_empresa":
    case "configurar_cameras":
    case "ver_auditoria":
      return patrao;
  }
}
