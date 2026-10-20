import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pb } from "../lib/pb";
import { somenteDigitos } from "../lib/formato";
import type { Usuario } from "../lib/tipos";

interface SessaoCtx {
  usuario: Usuario | null;
  entrar: (celular: string, senha: string) => Promise<void>;
  sair: () => void;
  atualizarUsuario: (u: Usuario) => void;
}

const Ctx = createContext<SessaoCtx | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(
    pb.authStore.isValid ? (pb.authStore.record as unknown as Usuario) : null,
  );

  useEffect(() => {
    const desligar = pb.authStore.onChange((_, record) => {
      setUsuario(pb.authStore.isValid ? (record as unknown as Usuario) : null);
    });
    // Renova o token ao abrir o app; se a senha foi trocada pelo patrão, cai fora.
    if (pb.authStore.isValid) {
      pb.collection("usuarios").authRefresh().catch((err) => {
        if (err?.status === 401 || err?.status === 403 || err?.status === 404) pb.authStore.clear();
      });
    }
    return desligar;
  }, []);

  const valor: SessaoCtx = {
    usuario,
    entrar: async (celular, senha) => {
      await pb.collection("usuarios").authWithPassword(somenteDigitos(celular), senha);
    },
    sair: () => pb.authStore.clear(),
    atualizarUsuario: (u) => pb.authStore.save(pb.authStore.token, u as never),
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSessao fora do SessaoProvider");
  return c;
}
