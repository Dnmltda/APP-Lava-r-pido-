import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { Aviso, Carregando, EstadoVazio } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { dia, linkWhatsApp, mascaraCelular, primeiroNome } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";

// Clientes que sumiram: passou de 30 dias (ou o que o dono escolher) sem voltar.
// Dono e gerente mandam uma mensagem no WhatsApp para trazer de volta; o app marca o contato.

interface Sumido {
  usuario: string;
  nome: string;
  celular: string;
  aceita_promocoes: boolean;
  visitas: number;
  ultima_visita: string;
  cliente_desde: string;
  contatado_em: string;
}

const CHAVE_TEXTO = "lr-reativar-texto";
const TEXTO_PADRAO = "Oi, {nome}! Tudo bem? Faz tempo que você não passa no {empresa}. Que tal deixar o carro brilhando essa semana? Entre na fila pelo app: {link}";

export function Reativar() {
  const { empresa, vinculo } = useEmpresa();
  const [dias, setDias] = useState(30);
  const [lista, setLista] = useState<Sumido[] | null>(null);
  const [texto, setTexto] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_TEXTO) || TEXTO_PADRAO;
    } catch {
      return TEXTO_PADRAO;
    }
  });
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await pb.send<{ clientes: Sumido[] }>(`/api/lr/reativar/${empresa.id}`, { method: "GET", query: { dias } });
      setLista(r.clientes);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [empresa.id, dias]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (vinculo?.papel !== "patrao" && vinculo?.papel !== "gerente") return <Navigate to={`/${empresa.slug}`} replace />;

  const link = `${window.location.origin}/${empresa.slug}`;
  const mensagem = (c: Sumido) => texto.replaceAll("{nome}", primeiroNome(c.nome)).replaceAll("{empresa}", empresa.nome).replaceAll("{link}", link);

  function guardarTexto(t: string) {
    setTexto(t);
    try {
      localStorage.setItem(CHAVE_TEXTO, t);
    } catch {
      // sem problema: vale só nesta tela
    }
  }
  async function marcar(c: Sumido) {
    try {
      const r = await pb.send<{ contatado_em: string }>(`/api/lr/reativar/${empresa.id}/${c.usuario}`, { method: "POST" });
      setLista((l) => (l || []).map((x) => (x.usuario === c.usuario ? { ...x, contatado_em: r.contatado_em } : x)));
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <Moldura voltarPara={`/${empresa.slug}`} titulo="Reativar clientes">
      <p className="text-base text-tinta-suave">Clientes que não voltam há um tempo. Mande uma mensagem e traga de volta.</p>
      <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Sem voltar há">
        {[30, 60, 90].map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dias === d}
            onClick={() => setDias(d)}
            className={`min-h-11 flex-1 rounded-full border-2 text-sm font-bold ${dias === d ? "border-marca bg-marca text-sobre-marca" : "border-linha bg-white text-tinta"}`}
          >
            {d}+ dias
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="msg-reativar" className="text-base font-semibold text-tinta">
          Mensagem
        </label>
        <textarea
          id="msg-reativar"
          rows={3}
          maxLength={500}
          value={texto}
          onChange={(e) => guardarTexto(e.target.value)}
          className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base focus:border-marca focus:outline-none"
        />
        <p className="text-sm text-tinta-suave">
          {"{nome}"} vira o nome do cliente, {"{empresa}"} o nome do lava rápido e {"{link}"} o link do app.
          {texto !== TEXTO_PADRAO && (
            <button type="button" onClick={() => guardarTexto(TEXTO_PADRAO)} className="ml-2 font-bold text-marca-forte underline">
              voltar ao texto padrão
            </button>
          )}
        </p>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="mt-5 flex flex-col gap-2">
        {lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Ninguém sumido" texto={`Todos os clientes voltaram nos últimos ${dias} dias.`} />
        ) : (
          lista.map((c) => (
            <article key={c.usuario} className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-base font-extrabold text-tinta">{c.nome}</p>
              <p className="text-sm text-tinta-suave">
                {mascaraCelular(c.celular)} · {c.visitas ? `${c.visitas} ${c.visitas === 1 ? "visita" : "visitas"}, última em ${dia(c.ultima_visita)}` : `cadastrado em ${dia(c.cliente_desde)}, nunca lavou`}
                {c.aceita_promocoes ? " · aceita promoções" : ""}
              </p>
              {c.contatado_em && <p className="text-sm font-semibold text-green-800">Mensagem mandada em {dia(c.contatado_em)}</p>}
              <a
                href={linkWhatsApp(c.celular, mensagem(c))}
                target="_blank"
                rel="noreferrer"
                onClick={() => marcar(c)}
                className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-[#1f7a45] px-4 font-bold text-white"
              >
                {c.contatado_em ? "Mandar de novo no WhatsApp" : "Mandar mensagem no WhatsApp"}
              </a>
            </article>
          ))
        )}
      </div>
    </Moldura>
  );
}
