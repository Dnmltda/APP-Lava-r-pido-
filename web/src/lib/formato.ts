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
