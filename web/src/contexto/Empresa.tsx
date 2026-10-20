import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { pb, mensagemDeErro } from "../lib/pb";
import { aplicarTema } from "../lib/tema";
import type { Empresa, Vinculo } from "../lib/tipos";
import { useSessao } from "./Sessao";

interface EmpresaCtx {
  empresa: Empresa;
  // null = visitante (sem login). O vínculo é criado como "cliente" ao entrar pelo link.
  vinculo: Vinculo | null;
  erroVinculo: string;
  recarregarEmpresa: () => Promise<void>;
}

const Ctx = createContext<EmpresaCtx | null>(null);

type Estado =
  | { tipo: "carregando" }
  | { tipo: "nao_encontrada" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; empresa: Empresa };

export function EmpresaProvider({
  slug,
  children,
  carregando,
  naoEncontrada,
  erro,
}: {
  slug: string;
  children: ReactNode;
  carregando: ReactNode;
  naoEncontrada: ReactNode;
  erro: (mensagem: string, tentar: () => void) => ReactNode;
}) {
  const { usuario } = useSessao();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [vinculoPronto, setVinculoPronto] = useState(false);
  const [erroVinculo, setErroVinculo] = useState("");

  const carregarEmpresa = useCallback(async () => {
    try {
      const empresa = await pb
        .collection("empresas")
        .getFirstListItem<Empresa>(pb.filter("slug = {:slug}", { slug }));
      aplicarTema(empresa.cor_principal);
      document.title = `${empresa.nome} · DNM&LTDA Lava Rápido`;
      setEstado({ tipo: "pronto", empresa });
    } catch (err: unknown) {
      if ((err as { status?: number })?.status === 404) setEstado({ tipo: "nao_encontrada" });
      else setEstado({ tipo: "erro", mensagem: mensagemDeErro(err) });
    }
  }, [slug]);

  useEffect(() => {
    setEstado({ tipo: "carregando" });
    carregarEmpresa();
  }, [carregarEmpresa]);

  const empresaId = estado.tipo === "pronto" ? estado.empresa.id : "";

  useEffect(() => {
    if (!empresaId) return;
    setErroVinculo("");
    if (!usuario) {
      setVinculo(null);
      setVinculoPronto(true);
      return;
    }
    setVinculoPronto(false);
    pb.send<{ id: string }>(`/api/lr/entrar/${encodeURIComponent(slug)}`, { method: "POST" })
      .then((r) => pb.collection("vinculos").getOne<Vinculo>(r.id))
      .then((v) => setVinculo(v))
      .catch((err) => {
        setVinculo(null);
        setErroVinculo(mensagemDeErro(err));
      })
      .finally(() => setVinculoPronto(true));
  }, [empresaId, usuario?.id, slug]);

  if (estado.tipo === "carregando" || (estado.tipo === "pronto" && !vinculoPronto)) return <>{carregando}</>;
  if (estado.tipo === "nao_encontrada") return <>{naoEncontrada}</>;
  if (estado.tipo === "erro") return <>{erro(estado.mensagem, carregarEmpresa)}</>;

  return (
    <Ctx.Provider value={{ empresa: estado.empresa, vinculo, erroVinculo, recarregarEmpresa: carregarEmpresa }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEmpresa() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEmpresa fora do EmpresaProvider");
  return c;
}
