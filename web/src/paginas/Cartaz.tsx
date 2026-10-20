import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Botao, Carregando } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { urlArquivo } from "../lib/pb";
import { pode } from "../lib/permissoes";

// Cartaz do balcão (só o patrão): QR Code que abre o app deste lava rápido.
// Imprimir em A4 ou salvar em PDF pelo botão "Imprimir".
export function Cartaz() {
  const { empresa, vinculo } = useEmpresa();
  const link = `${window.location.origin}/${empresa.slug}`;
  const [svg, setSvg] = useState("");
  const logo = urlArquivo(empresa, empresa.logo, "256x256");

  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }).then(setSvg, () => setSvg(""));
  }, [link]);

  if (!pode(vinculo, "configurar_empresa")) return <Navigate to={`/${empresa.slug}`} replace />;

  return (
    <div className="min-h-dvh bg-fundo print:bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 print:hidden">
        <Link to={`/${empresa.slug}`} className="inline-flex min-h-12 items-center rounded-xl px-3 font-bold text-marca-forte">
          ← Voltar
        </Link>
        <Botao onClick={() => window.print()}>Imprimir</Botao>
      </div>
      <p className="mx-auto max-w-2xl px-4 pb-3 text-base text-tinta-suave print:hidden">
        Imprima em A4 e deixe no balcão, na parede da espera e no caixa. Também dá para salvar em PDF e mandar nas redes sociais.
      </p>
      <article className="mx-auto flex max-w-[20cm] flex-col items-center gap-5 rounded-3xl border-[6px] border-marca bg-white px-8 py-10 text-center shadow-sm print:max-w-none print:rounded-none print:shadow-none">
        {logo ? (
          <img src={logo} alt="" className="h-24 w-24 rounded-2xl object-contain" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-marca text-4xl font-black text-sobre-marca">{empresa.nome.slice(0, 1)}</span>
        )}
        <h1 className="text-4xl font-black leading-tight text-tinta">{empresa.nome}</h1>
        <p className="text-3xl font-extrabold leading-tight text-marca-forte">Entre na fila pelo celular</p>
        <p className="max-w-md text-xl text-tinta">Veja a fila ao vivo, a previsão do seu carro e receba o aviso quando for a sua vez.</p>
        {svg ? (
          <div className="w-64 max-w-full sm:w-72" role="img" aria-label={`QR Code para ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <Carregando texto="Gerando o QR Code…" />
        )}
        <ol className="flex flex-col gap-1 text-left text-xl text-tinta">
          <li>
            <strong>1.</strong> Aponte a câmera do celular para o código
          </li>
          <li>
            <strong>2.</strong> Faça o cadastro (nome, celular e carro)
          </li>
          <li>
            <strong>3.</strong> Toque em <strong>“Entrar na fila”</strong>
          </li>
        </ol>
        <p className="break-all text-lg font-bold text-tinta-suave">{link.replace(/^https?:\/\//, "")}</p>
        <p className="text-sm text-tinta-suave">Pagamento só no lava rápido, na hora. · DNM&amp;LTDA Lava Rápido</p>
      </article>
    </div>
  );
}
