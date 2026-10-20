import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, Campo, Carregando, Folha } from "../componentes/ui";
import { useEmpresa } from "../contexto/Empresa";
import { emQuanto, hora, nomeDaEntrada, placaDaEntrada, type EntradaFila } from "../lib/fila";
import { celularValido, mascaraCelular, normalizarPlaca, somenteDigitos } from "../lib/formato";
import { mensagemDeErro, pb } from "../lib/pb";
import type { Servico } from "../lib/tipos";
import { EscolhaTipo, tiposDaEmpresa } from "../componentes/TipoVeiculo";

// Ações da Etapa 3 na fila da equipe: reserva, dados da reserva, reposicionar,
// cancelar (com ou sem substituição).

function useServicosAtivos() {
  const { empresa } = useEmpresa();
  const [servicos, setServicos] = useState<Servico[] | null>(null);
  useEffect(() => {
    pb.collection("servicos")
      .getFullList<Servico>({ filter: pb.filter("empresa = {:e} && ativo = true", { e: empresa.id }), sort: "ordem_exibicao,nome" })
      .then(setServicos)
      .catch(() => setServicos([]));
  }, [empresa.id]);
  return servicos;
}

export function EscolherServico({ valor, onChange }: { valor: string; onChange: (id: string) => void }) {
  const servicos = useServicosAtivos();
  return (
    <fieldset>
      <legend className="mb-2 text-base font-bold text-tinta">Serviço</legend>
      {servicos === null ? (
        <Carregando />
      ) : servicos.length === 0 ? (
        <p className="text-base text-tinta-suave">Cadastre os serviços em Serviços.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {servicos.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={valor === s.id}
              onClick={() => onChange(s.id)}
              className={`min-h-12 rounded-xl border-2 px-3 py-2 text-base font-bold ${valor === s.id ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
            >
              {s.nome}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

interface DadosCliente {
  nome: string;
  celular: string;
  final_placa: string;
  veiculo_desc: string;
}

function CamposCliente({ valor, onChange, obrigatorio }: { valor: DadosCliente; onChange: (v: DadosCliente) => void; obrigatorio?: boolean }) {
  const mudar = (p: Partial<DadosCliente>) => onChange({ ...valor, ...p });
  return (
    <>
      <Campo rotulo={obrigatorio ? "Nome" : "Nome (opcional)"} value={valor.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo={obrigatorio ? "Final da placa" : "Final da placa (opc.)"}
          placeholder="D23"
          maxLength={3}
          autoCapitalize="characters"
          value={valor.final_placa}
          onChange={(e) => mudar({ final_placa: normalizarPlaca(e.target.value).slice(0, 3) })}
        />
        <Campo rotulo="Carro (opcional)" placeholder="Onix prata" value={valor.veiculo_desc} onChange={(e) => mudar({ veiculo_desc: e.target.value })} />
      </div>
      <Campo
        rotulo="Celular (opcional)"
        type="tel"
        inputMode="numeric"
        value={valor.celular}
        onChange={(e) => mudar({ celular: mascaraCelular(e.target.value) })}
        ajuda="Se for de um cliente cadastrado, ele acompanha pelo app."
      />
    </>
  );
}

function validarCliente(d: DadosCliente, obrigatorio: boolean) {
  if (obrigatorio && d.nome.trim().length < 2) return "Digite o nome.";
  if ((obrigatorio || d.final_placa) && d.final_placa.length !== 3) return "Digite os 3 últimos caracteres da placa.";
  if (d.celular && !celularValido(d.celular)) return "Celular inválido. Use DDD + número.";
  return "";
}

function corpoCliente(d: DadosCliente) {
  return { nome: d.nome.trim(), celular: somenteDigitos(d.celular), final_placa: d.final_placa, veiculo_desc: d.veiculo_desc.trim() };
}

const CLIENTE_VAZIO: DadosCliente = { nome: "", celular: "", final_placa: "", veiculo_desc: "" };

// "2026-10-20T15:00" no fuso de São Paulo para o próximo horário cheio.
function proximaHoraLocal() {
  const d = new Date(Date.now() + 60 * 60000);
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).format(d);
  return partes.replace(" ", "T") + ":00";
}

// Converte "2026-10-20T15:00" (horário de Brasília, sem horário de verão) para ISO UTC.
function localParaIso(v: string) {
  return new Date(`${v}:00-03:00`).toISOString();
}

export function NovaReserva({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (msg: string) => void }) {
  const { empresa } = useEmpresa();
  const [quando, setQuando] = useState(proximaHoraLocal());
  const [servico, setServico] = useState("");
  const [tipo, setTipo] = useState("");
  const [dados, setDados] = useState(CLIENTE_VAZIO);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!quando) return setErro("Escolha o dia e o horário.");
    if (!servico) return setErro("Escolha o serviço.");
    const problema = validarCliente(dados, false);
    if (problema) return setErro(problema);
    setEnviando(true);
    try {
      const r = await pb.send<{ previsao: string }>("/api/lr/fila/reserva", {
        method: "POST",
        body: { empresa: empresa.id, horario: localParaIso(quando), servico, tipo_veiculo: tipo, ...corpoCliente(dados) },
      });
      onSalvo(`Reserva encaixada na fila. Previsão de início: ${hora(r.previsao)}.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha titulo="Horário reservado" onFechar={onFechar}>
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <p className="text-base text-tinta-suave">
          O app encaixa a reserva na posição da fila que bate com o horário. Para o público aparece só “Reservado”.
        </p>
        <Campo rotulo="Dia e horário" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
        <EscolherServico valor={servico} onChange={setServico} />
        <EscolhaTipo tipos={tiposDaEmpresa(empresa)} valor={tipo} onChange={setTipo} semTipo="Padrão" />
        <p className="-mb-2 text-base font-bold text-tinta">Cliente (pode preencher depois)</p>
        <CamposCliente valor={dados} onChange={setDados} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={enviando}>
          Reservar
        </Botao>
      </form>
    </Folha>
  );
}

export function DadosEntrada({ entrada, onFechar, onSalvo }: { entrada: EntradaFila; onFechar: () => void; onSalvo: () => void }) {
  const [dados, setDados] = useState<DadosCliente>({
    nome: entrada.nome_avulso,
    celular: mascaraCelular(entrada.celular_avulso || ""),
    final_placa: entrada.final_placa_avulsa,
    veiculo_desc: entrada.veiculo_avulso,
  });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = validarCliente(dados, false);
    if (problema) return setErro(problema);
    setEnviando(true);
    setErro("");
    try {
      await pb.send(`/api/lr/fila/${entrada.id}/dados`, { method: "POST", body: corpoCliente(dados) });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha titulo="Dados do cliente" onFechar={onFechar}>
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <CamposCliente valor={dados} onChange={setDados} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" largo carregando={enviando}>
          Salvar
        </Botao>
      </form>
    </Folha>
  );
}

export function Reposicionar({ entrada, onFechar, onSalvo }: { entrada: EntradaFila; onFechar: () => void; onSalvo: (msg: string) => void }) {
  const [minutos, setMinutos] = useState(0);
  const [outro, setOutro] = useState("");
  const [simulacao, setSimulacao] = useState<{ posicao_atual: number; nova_posicao: number; previsao: string } | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function simular(m: number) {
    setMinutos(m);
    setSimulacao(null);
    setErro("");
    if (!m || m < 1) return;
    setOcupado(true);
    try {
      setSimulacao(await pb.send(`/api/lr/fila/${entrada.id}/reposicionar`, { method: "POST", body: { minutos: m, simular: true } }));
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setOcupado(false);
    }
  }

  async function aplicar() {
    setOcupado(true);
    setErro("");
    try {
      const r = await pb.send<{ nova_posicao: number; previsao: string }>(`/api/lr/fila/${entrada.id}/reposicionar`, {
        method: "POST",
        body: { minutos },
      });
      onSalvo(`${nomeDaEntrada(entrada)} agora está na posição ${r.nova_posicao}, previsão ${hora(r.previsao)}.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Folha titulo={`Reposicionar ${nomeDaEntrada(entrada)}`} onFechar={onFechar}>
      <p className="text-base text-tinta-suave">O cliente continua na fila. Em quanto tempo ele chega?</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[10, 15, 20, 30, 45, 60].map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={minutos === m}
            onClick={() => {
              setOutro("");
              simular(m);
            }}
            className={`min-h-12 rounded-xl border-2 text-base font-bold ${minutos === m && !outro ? "border-marca bg-marca-suave text-marca-forte" : "border-linha bg-white text-tinta"}`}
          >
            {m} min
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Campo
          rotulo="Outro (minutos)"
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          onBlur={() => outro && simular(parseInt(outro, 10))}
        />
      </div>
      {ocupado && !simulacao && <Carregando texto="Calculando a posição…" />}
      {simulacao && (
        <div className="mt-4 rounded-2xl bg-marca-suave p-4 text-base text-tinta">
          {simulacao.nova_posicao === simulacao.posicao_atual ? (
            <p>Continua na posição <strong>{simulacao.posicao_atual}</strong>.</p>
          ) : (
            <p>
              Vai da posição <strong>{simulacao.posicao_atual}</strong> para a <strong>{simulacao.nova_posicao}</strong>.
            </p>
          )}
          <p className="mt-1">
            Nova previsão: <strong>{hora(simulacao.previsao)}</strong> ({emQuanto(simulacao.previsao)}).
          </p>
        </div>
      )}
      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <Botao largo className="mt-5" disabled={!simulacao} carregando={ocupado && !!simulacao} onClick={aplicar}>
        Confirmar nova posição
      </Botao>
    </Folha>
  );
}

export function CancelarEntrada({
  entrada,
  recusar,
  onFechar,
  onSalvo,
}: {
  entrada: EntradaFila;
  recusar?: boolean;
  onFechar: () => void;
  onSalvo: (msg: string) => void;
}) {
  const [modo, setModo] = useState<"cancelar" | "substituir">("cancelar");
  const [motivo, setMotivo] = useState("");
  const [servico, setServico] = useState("");
  const [tipo, setTipo] = useState("");
  const [dados, setDados] = useState(CLIENTE_VAZIO);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { empresa } = useEmpresa();
  const nome = nomeDaEntrada(entrada);

  async function confirmar() {
    setErro("");
    if (modo === "substituir") {
      const problema = validarCliente(dados, true);
      if (problema) return setErro(problema);
      if (!servico) return setErro("Escolha o serviço de quem vai entrar.");
    }
    setEnviando(true);
    try {
      if (modo === "substituir") {
        await pb.send(`/api/lr/fila/${entrada.id}/substituir`, {
          method: "POST",
          body: { servico, tipo_veiculo: tipo, motivo: motivo.trim(), ...corpoCliente(dados) },
        });
        onSalvo(`${dados.nome.trim()} entrou no lugar de ${nome}, na mesma posição.`);
      } else {
        await pb.send(`/api/lr/fila/${entrada.id}/${recusar ? "recusar" : "cancelar"}`, { method: "POST", body: { motivo: motivo.trim() } });
        onSalvo(`${nome} ${recusar ? "recusado" : "cancelado"}. A fila subiu uma posição.`);
      }
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha titulo={`${recusar ? "Recusar" : "Cancelar"} ${nome}?`} onFechar={onFechar}>
      <p className="text-base text-tinta">
        <span className="font-mono font-bold">{placaDaEntrada(entrada)}</span>
      </p>
      {!recusar && (
        <div className="mt-4 grid grid-cols-1 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={modo === "cancelar"}
            onClick={() => setModo("cancelar")}
            className={`min-h-14 rounded-2xl border-2 px-4 py-2 text-left ${modo === "cancelar" ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
          >
            <span className="block text-base font-bold text-tinta">Só cancelar</span>
            <span className="block text-sm text-tinta-suave">A vaga some e todos abaixo sobem uma posição.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={modo === "substituir"}
            onClick={() => setModo("substituir")}
            className={`min-h-14 rounded-2xl border-2 px-4 py-2 text-left ${modo === "substituir" ? "border-marca bg-marca-suave" : "border-linha bg-white"}`}
          >
            <span className="block text-base font-bold text-tinta">Cancelar e colocar quem está no local</span>
            <span className="block text-sm text-tinta-suave">Outro cliente entra nesta mesma posição. Só agora: depois de cancelada, a vaga não volta.</span>
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-4">
        {modo === "substituir" && (
          <>
            <CamposCliente valor={dados} onChange={setDados} obrigatorio />
            <EscolherServico valor={servico} onChange={setServico} />
            <EscolhaTipo tipos={tiposDaEmpresa(empresa)} valor={tipo} onChange={setTipo} semTipo="Padrão" />
          </>
        )}
        <Campo rotulo="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao variante={modo === "substituir" ? "primario" : "perigo"} largo carregando={enviando} onClick={confirmar}>
          {modo === "substituir" ? "Cancelar e substituir" : recusar ? "Recusar" : "Cancelar a vaga"}
        </Botao>
        <Botao variante="secundario" largo onClick={onFechar} disabled={enviando}>
          Voltar
        </Botao>
      </div>
    </Folha>
  );
}
