import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useEmpresa } from "../contexto/Empresa";
import { urlArquivo } from "../lib/pb";
import { RodapeDNM } from "./Marca";

// Cabeçalho com o lava rápido (logo e nome) nas cores DNM&LTDA + rodapé com o logo DNM&LTDA.
export function Moldura({
  children,
  voltarPara,
  titulo,
  largo,
}: {
  children: ReactNode;
  voltarPara?: string;
  titulo?: string;
  /** Telas de painel (dashboard): usam a largura do computador. */
  largo?: boolean;
}) {
  const largura = largo ? "max-w-6xl" : "max-w-2xl";
  const { empresa } = useEmpresa();
  const logo = urlArquivo(empresa, empresa.logo, "128x128");
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="cabecalho-dnm">
        <div className={`mx-auto flex ${largura} items-center gap-3 px-4 py-3`}>
          {voltarPara ? (
            <Link
              to={voltarPara}
              aria-label="Voltar"
              className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-white/10"
            >
              ←
            </Link>
          ) : logo ? (
            <img src={logo} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-2 ring-dourado" />
          ) : (
            <span className="titulo-dnm flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl font-black text-dourado ring-2 ring-dourado">
              {empresa.nome.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="titulo-dnm truncate text-xl font-black leading-tight">{titulo || empresa.nome}</p>
            {titulo && <p className="truncate text-sm text-dourado">{empresa.nome}</p>}
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${largura} flex-1 px-4 py-5`}>{children}</main>
      <RodapeDNM />
    </div>
  );
}
