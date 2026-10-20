import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useEmpresa } from "../contexto/Empresa";
import { urlArquivo } from "../lib/pb";

// Cabeçalho com a identidade do lava rápido (logo, nome, cor) + selo DNM&LTDA.
export function Moldura({
  children,
  voltarPara,
  titulo,
}: {
  children: ReactNode;
  voltarPara?: string;
  titulo?: string;
}) {
  const { empresa } = useEmpresa();
  const logo = urlArquivo(empresa, empresa.logo, "128x128");
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="bg-marca text-sobre-marca">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {voltarPara ? (
            <Link
              to={voltarPara}
              aria-label="Voltar"
              className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-black/10"
            >
              ←
            </Link>
          ) : logo ? (
            <img src={logo} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-0.5" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/15 text-xl font-black">
              {empresa.nome.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold leading-tight">{titulo || empresa.nome}</p>
            {titulo && <p className="truncate text-sm opacity-85">{empresa.nome}</p>}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>
      <footer className="px-4 pb-6 pt-2 text-center text-sm text-tinta-suave">
        DNM<span className="font-[system-ui]">&amp;</span>LTDA Lava Rápido
      </footer>
    </div>
  );
}
