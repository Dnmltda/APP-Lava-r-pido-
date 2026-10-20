import { pb } from "./pb";

// Notificações no celular (Web Push). No iPhone só funcionam com o app
// instalado na Tela de Início (iOS 16.4+).

export type EstadoAvisos = "sem_suporte" | "instalar_iphone" | "negado" | "desligado" | "ligado";

export function ehIPhone() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function appInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function suportado() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (ehIPhone() && !appInstalado()) return "instalar_iphone";
  if (!suportado()) return "sem_suporte";
  if (Notification.permission === "denied") return "negado";
  if (Notification.permission !== "granted") return "desligado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? "ligado" : "desligado";
}

function chaveParaBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function ativarAvisos(usuarioId: string): Promise<EstadoAvisos> {
  if (!suportado()) return "sem_suporte";
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "negado" : "desligado";
  const reg = await navigator.serviceWorker.ready;
  const { publica } = await pb.send<{ publica: string }>("/api/lr/push/chave", { method: "GET" });
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(publica) });
  const json = sub.toJSON();
  const existente = await pb
    .collection("push_inscricoes")
    .getFirstListItem(pb.filter("endpoint = {:e}", { e: json.endpoint }))
    .catch(() => null);
  if (!existente) {
    await pb.collection("push_inscricoes").create({
      usuario: usuarioId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      dispositivo: navigator.userAgent.slice(0, 200),
    });
  }
  return "ligado";
}

// Ao sair do app: este aparelho para de receber avisos desta conta.
export async function desativarAvisos() {
  try {
    if (!suportado()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const existente = await pb
      .collection("push_inscricoes")
      .getFirstListItem(pb.filter("endpoint = {:e}", { e: sub.endpoint }))
      .catch(() => null);
    if (existente) await pb.collection("push_inscricoes").delete(existente.id);
    await sub.unsubscribe();
  } catch {
    /* sem rede: o servidor apaga sozinho quando o aviso falhar */
  }
}
