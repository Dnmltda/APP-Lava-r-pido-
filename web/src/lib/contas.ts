import { pb } from "./pb";
import type { Usuario } from "./tipos";

// Várias contas no mesmo celular (ex.: o amigo empresta o celular para você pôr o seu carro na fila).
// Cada conta usada aqui fica na lista: nome e celular sempre; o acesso sem senha só se a pessoa pediu
// "Salvar a senha". Não guardamos a senha escrita: guardamos a chave de acesso da sessão, que deixa de
// valer se a senha for trocada (aí o app pede a senha de novo).

export interface ContaSalva {
  id: string;
  nome: string;
  celular: string;
  /** Chave de acesso guardada (= "senha salva"). Sem ela, o app pede a senha. */
  token?: string;
  usadoEm: number;
}

const CHAVE = "lr_contas";
const MAX = 8;

export function listarContas(): ContaSalva[] {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    return Array.isArray(l) ? (l as ContaSalva[]).filter((c) => c && c.id && c.celular).sort((a, b) => b.usadoEm - a.usadoEm) : [];
  } catch {
    return [];
  }
}

function gravar(lista: ContaSalva[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAX)));
  } catch {
    // modo privado: só não lembra
  }
  window.dispatchEvent(new Event("lr-contas"));
}

/** Guarda (ou atualiza) a conta que acabou de entrar. salvarSenha=false tira o acesso guardado. */
export function lembrarConta(u: Pick<Usuario, "id" | "nome" | "celular">, salvarSenha: boolean) {
  const outras = listarContas().filter((c) => c.id !== u.id);
  gravar([{ id: u.id, nome: u.nome, celular: u.celular, token: salvarSenha ? pb.authStore.token : undefined, usadoEm: Date.now() }, ...outras]);
}

export function contaTemSenha(id: string) {
  return !!listarContas().find((c) => c.id === id)?.token;
}

/** Liga/desliga o "salvar senha" da conta que está aberta agora. */
export function mudarSenhaSalva(id: string, salvar: boolean) {
  gravar(listarContas().map((c) => (c.id === id ? { ...c, token: salvar && pb.authStore.record?.id === id ? pb.authStore.token : undefined } : c)));
}

export function esquecerConta(id: string) {
  gravar(listarContas().filter((c) => c.id !== id));
}

/** A sessão foi renovada: a conta com senha salva guarda a chave nova. */
export function renovarConta(id: string, token: string) {
  const lista = listarContas();
  if (lista.some((c) => c.id === id && c.token)) gravar(lista.map((c) => (c.id === id ? { ...c, token } : c)));
}

/** Entra direto com a chave guardada. false = precisa da senha (chave vencida ou senha trocada). */
export async function entrarComContaSalva(c: ContaSalva): Promise<boolean> {
  if (!c.token) return false;
  // Confere a chave no servidor antes de abrir a conta (senha trocada ou chave vencida = pede a senha).
  try {
    const r = await pb.send<{ token: string; record: Usuario }>("/api/collections/usuarios/auth-refresh", {
      method: "POST",
      headers: { Authorization: c.token },
    });
    pb.authStore.save(r.token, r.record as never);
    lembrarConta(r.record, true);
    return true;
  } catch {
    gravar(listarContas().map((x) => (x.id === c.id ? { ...x, token: undefined } : x)));
    return false;
  }
}
