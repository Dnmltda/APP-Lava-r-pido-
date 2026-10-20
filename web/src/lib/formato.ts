export function somenteDigitos(v: string) {
  return v.replace(/\D/g, "");
}

// "11987654321" → "(11) 98765-4321"
export function mascaraCelular(v: string) {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function celularValido(v: string) {
  return /^[0-9]{10,11}$/.test(somenteDigitos(v));
}

export function linkWhatsApp(numero: string, mensagem?: string) {
  let d = somenteDigitos(numero);
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

export function primeiroNome(nome: string) {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const FMT_REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function reais(v: number) {
  return FMT_REAL.format(v || 0);
}

export function duracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Placa: maiúsculas, sem traço. Aceita antiga (ABC1234) e Mercosul (ABC1D23).
export function normalizarPlaca(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}
export function placaValida(v: string) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(v));
}

// "ter., 21/10 às 14:30" (São Paulo). Aceita o formato do PocketBase ("2026-10-21 17:30:00.000Z").
const FMT_DIA_HORA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
export function diaHora(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  return isNaN(d.getTime()) ? "" : FMT_DIA_HORA.format(d).replace(",", "").replace(" ", " ");
}
export function dia(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  return isNaN(d.getTime()) ? "" : FMT_DIA.format(d);
}
