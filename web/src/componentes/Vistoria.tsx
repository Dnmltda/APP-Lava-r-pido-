import { Camera } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { comprimirImagem } from "../lib/imagem";
import { mensagemDeErro, pb } from "../lib/pb";
import type { Vistoria } from "../lib/tipos";
import { Aviso, Botao, Carregando, Folha } from "./ui";

// Fotos de ANTES e DEPOIS do carro (opcional). Tirar: dono, gerente e responsável pela fila.
// Ver: equipe e o cliente do carro. As fotos são prova: não se apagam nem se editam.

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function useFotosDasEntradas(ids: string[]) {
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const chave = ids.slice().sort().join(",");
  const carregar = useCallback(async () => {
    if (!chave) return setContagem({});
    try {
      const lista = await pb.collection("vistorias").getFullList<Vistoria>({
        filter: chave
          .split(",")
          .map((id) => pb.filter("entrada = {:id}", { id }))
          .join(" || "),
        fields: "id,entrada,fotos",
      });
      const c: Record<string, number> = {};
      for (const v of lista) c[v.entrada] = (c[v.entrada] || 0) + (v.fotos?.length || 0);
      setContagem(c);
    } catch {
      // sem fotos não atrapalha a fila
    }
  }, [chave]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  return { contagem, recarregar: carregar };
}

export function FotosEntrada({
  entradaId,
  empresaId,
  titulo,
  podeTirar,
  momentoPadrao,
  onFechar,
  onMudou,
}: {
  entradaId: string;
  empresaId: string;
  titulo: string;
  podeTirar: boolean;
  momentoPadrao: "antes" | "depois";
  onFechar: () => void;
  onMudou?: () => void;
}) {
  const [lista, setLista] = useState<Vistoria[] | null>(null);
  const [token, setToken] = useState("");
  const [erro, setErro] = useState("");
  const [momento, setMomento] = useState(momentoPadrao);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [avarias, setAvarias] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([
        pb.collection("vistorias").getFullList<Vistoria>({ filter: pb.filter("entrada = {:e}", { e: entradaId }), sort: "created", expand: "criado_por" }),
        pb.files.getToken(),
      ]);
      setLista(l);
      setToken(t);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [entradaId]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviar() {
    if (!arquivos.length) return setErro("Tire ou escolha pelo menos uma foto.");
    setEnviando(true);
    setErro("");
    try {
      const f = new FormData();
      f.append("empresa", empresaId);
      f.append("entrada", entradaId);
      f.append("momento", momento);
      f.append("avarias", avarias.trim());
      f.append("criado_por", pb.authStore.record?.id || "");
      for (const a of arquivos.slice(0, 8)) f.append("fotos", await comprimirImagem(a));
      await pb.collection("vistorias").create(f);
      setArquivos([]);
      setAvarias("");
      await carregar();
      onMudou?.();
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível enviar as fotos. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }

  const url = (v: Vistoria, nome: string, thumb?: string) => pb.files.getURL(v, nome, { token, ...(thumb ? { thumb } : {}) });

  return (
    <Folha titulo={titulo} onFechar={onFechar}>
      <div className="flex flex-col gap-5">
        {lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <p className="text-base text-tinta-suave">Nenhuma foto ainda.</p>
        ) : (
          (["antes", "depois"] as const).map((m) => {
            const doMomento = lista.filter((v) => v.momento === m);
            if (!doMomento.length) return null;
            return (
              <section key={m}>
                <h3 className="mb-2 text-base font-extrabold text-tinta">{m === "antes" ? "Antes (na entrada)" : "Depois (na saída)"}</h3>
                {doMomento.map((v) => (
                  <div key={v.id} className="mb-3">
                    <div className="grid grid-cols-3 gap-2">
                      {v.fotos.map((f) => (
                        <a key={f} href={url(v, f)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-fundo">
                          <img src={url(v, f, "400x0")} alt={`Foto ${m === "antes" ? "de antes" : "de depois"}`} className="aspect-square w-full object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                    <p className="mt-1 text-sm text-tinta-suave">
                      {FMT_HORA.format(new Date(v.created.replace(" ", "T")))}
                      {v.expand?.criado_por?.nome ? ` · ${v.expand.criado_por.nome.split(" ")[0]}` : ""}
                      {v.avarias ? ` · Avarias: ${v.avarias}` : ""}
                    </p>
                  </div>
                ))}
              </section>
            );
          })
        )}

        {podeTirar && (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-linha bg-white p-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Momento">
              {(["antes", "depois"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={momento === m}
                  onClick={() => setMomento(m)}
                  className={`min-h-12 rounded-xl border-2 font-bold ${momento === m ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
                >
                  {m === "antes" ? "Antes" : "Depois"}
                </button>
              ))}
            </div>
            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-marca px-4 text-base font-bold text-sobre-marca">
              <Camera className="h-6 w-6" aria-hidden="true" />
              {arquivos.length ? `${arquivos.length} foto(s) escolhida(s)` : "Tirar fotos"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => setArquivos(Array.from(e.target.files || []).slice(0, 8))}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="avarias" className="text-base font-semibold text-tinta">
                Avarias que já tinha (opcional)
              </label>
              <textarea
                id="avarias"
                rows={2}
                maxLength={500}
                placeholder="Ex.: risco na porta traseira direita"
                value={avarias}
                onChange={(e) => setAvarias(e.target.value)}
                className="rounded-xl border-2 border-linha bg-white px-4 py-3 text-base focus:border-marca focus:outline-none"
              />
            </div>
            {erro && <Aviso>{erro}</Aviso>}
            <Botao largo carregando={enviando} disabled={!arquivos.length} onClick={enviar}>
              Salvar fotos
            </Botao>
            <p className="text-sm text-tinta-suave">As fotos ficam guardadas como prova e não podem ser apagadas. O cliente vê as do carro dele.</p>
          </div>
        )}
        {!podeTirar && erro && <Aviso>{erro}</Aviso>}
      </div>
    </Folha>
  );
}
