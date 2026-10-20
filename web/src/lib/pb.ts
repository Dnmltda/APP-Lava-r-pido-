import PocketBase, { ClientResponseError } from "pocketbase";

// Endereço do backend em variável de ambiente: trocar de servidor é só mudar
// VITE_PB_URL no .env (ver .env.example). Vazio em produção = mesmo endereço do
// app (o PocketBase serve o app e a API juntos).
const URL_PB =
  import.meta.env.VITE_PB_URL || (import.meta.env.DEV ? "http://127.0.0.1:8090" : window.location.origin);
export const pb = new PocketBase(URL_PB);
pb.autoCancellation(false);

export function mensagemDeErro(err: unknown, padrao = "Algo deu errado. Tente de novo."): string {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) return "Sem conexão com o servidor. Verifique a internet.";
    if (err.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    const campos = err.response?.data as Record<string, { message?: string }> | undefined;
    const primeiroCampo = campos && Object.values(campos)[0]?.message;
    return err.response?.message && err.response.message !== "Something went wrong while processing your request."
      ? err.response.message
      : primeiroCampo || padrao;
  }
  return padrao;
}

export function urlArquivo(record: { id: string; collectionId: string }, arquivo: string, thumb?: string) {
  if (!arquivo) return "";
  return pb.files.getURL(record, arquivo, thumb ? { thumb } : undefined);
}
