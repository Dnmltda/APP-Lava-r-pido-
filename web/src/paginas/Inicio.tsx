import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { InstalarApp } from "../componentes/Avisos";
import { CenaLavagem, RodapeDNM } from "../componentes/Marca";
import { Botao, Carregando } from "../componentes/ui";
import { lerUltimaEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { FormEntrar } from "./Acesso";
import { pb } from "../lib/pb";
import { temaPadrao } from "../lib/tema";
import { NOME_PAPEL, type Vinculo } from "../lib/tipos";

// Página raiz (sem lava rápido escolhido). O cliente normalmente chega pelo
// link/QR do lava rápido. O app instalado abre aqui: vai direto ao último lava
// rápido aberto; sem ele, dá para entrar com celular e senha e escolher.
export function Inicio() {
  const { usuario, sair } = useSessao();
  const [vinculos, setVinculos] = useState<Vinculo[] | null>(null);
  const ficar = !!(useLocation().state as { ficar?: boolean } | null)?.ficar;
  const ultima = ficar ? "" : lerUltimaEmpresa();

  useEffect(() => {
    temaPadrao();
    document.title = "DNM&LTDA Lava Rápido";
  }, []);

  useEffect(() => {
    if (!usuario) return;
    pb.collection("vinculos")
      .getFullList<Vinculo>({
        filter: pb.filter("usuario = {:u} && ativo = true", { u: usuario.id }),
        expand: "empresa",
      })
      .then((v) => setVinculos(v.filter((x) => x.expand?.empresa)))
      .catch(() => setVinculos([]));
  }, [usuario]);

  if (ultima) return <Navigate to={`/${ultima}`} replace />;
  if (!ficar && vinculos?.length === 1) return <Navigate to={`/${vinculos[0].expand!.empresa!.slug}`} replace />;

  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="cabecalho-dnm px-4 pb-6 pt-6">
        <div className="mx-auto max-w-2xl">
          <img
            src="/logo-dnm-marca.webp"
            alt="DNM&LTDA"
            width={220}
            height={116}
            className="mx-auto h-auto w-[200px] rounded-2xl shadow-lg ring-2 ring-dourado"
          />
          <h1 className="mt-4 text-center text-3xl font-black">Lava Rápido</h1>
          <p className="mt-1 text-center text-base text-white/85">Fila, reservas e equipe do seu lava rápido no celular.</p>
        </div>
      </header>
      <div className="mx-auto -mb-2 w-full max-w-2xl px-4 pt-5">
        <CenaLavagem titulo="Seu carro brilhando, sem fila parada" texto="Acompanhe a vez, reserve horário e receba o aviso quando ficar pronto." />
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {!usuario ? (
          <>
            <div className="rounded-2xl border border-linha bg-white p-5 text-base text-tinta shadow-sm">
              <h2 className="text-lg font-bold">Entrar</h2>
              <p className="mt-1 text-tinta-suave">Já tem cadastro em um lava rápido? Use o celular e a senha.</p>
              <FormEntrar onEntrou={() => undefined} />
            </div>
            <div className="mt-4 rounded-2xl border border-linha bg-white p-5 text-base text-tinta shadow-sm">
              <h2 className="text-lg font-bold">Primeira vez?</h2>
              <p className="mt-2 text-tinta-suave">
                Abra o link ou leia o QR Code do seu lava rápido para se cadastrar. Ele fica no balcão e nas redes sociais do lava rápido.
              </p>
            </div>
          </>
        ) : vinculos === null ? (
          <Carregando />
        ) : (
          <>
            <h2 className="text-lg font-extrabold text-tinta">Seus lava rápidos</h2>
            <div className="mt-3 flex flex-col gap-3">
              {vinculos.length === 0 && (
                <p className="text-base text-tinta-suave">Nenhum ainda. Abra o link ou o QR Code do lava rápido.</p>
              )}
              {vinculos.map((v) => (
                <Link
                  key={v.id}
                  to={`/${v.expand!.empresa!.slug}`}
                  className="flex min-h-16 items-center justify-between rounded-2xl border border-linha bg-white px-4 py-3 shadow-sm hover:border-marca"
                >
                  <span>
                    <span className="block text-lg font-bold text-tinta">{v.expand!.empresa!.nome}</span>
                    <span className="block text-base text-tinta-suave">{NOME_PAPEL[v.papel]}</span>
                  </span>
                  <span className="text-2xl text-marca" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
            <Botao variante="secundario" largo className="mt-8" onClick={sair}>
              Sair
            </Botao>
          </>
        )}
        <div className="mt-6">
          <InstalarApp />
        </div>
        <p className="mt-8 text-center text-sm">
          <a href="/_/" className="font-semibold text-tinta-suave underline">
            Administração da plataforma (DNM&amp;LTDA)
          </a>
        </p>
      </main>
      <RodapeDNM />
    </div>
  );
}
