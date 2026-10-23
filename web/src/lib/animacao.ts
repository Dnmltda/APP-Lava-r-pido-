import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

// Animações leves, sem bibliotecas. Todas respeitam "reduzir movimento" do aparelho.

export function semMovimento() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Número que conta de 0 (ou do valor anterior) até o valor real. */
export function useContagem(valor: number, duracaoMs = 900) {
  const [atual, setAtual] = useState(() => (semMovimento() ? valor : 0));
  const anterior = useRef(semMovimento() ? valor : 0);
  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (semMovimento() || de === valor || !Number.isFinite(valor)) {
      setAtual(valor);
      return;
    }
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      const suave = 1 - (1 - t) ** 3;
      setAtual(t === 1 ? valor : de + (valor - de) * suave);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, duracaoMs]);
  return atual;
}

/**
 * Lista que se reorganiza animada (técnica FLIP): quando um carro avança na fila,
 * os cartões deslizam até a posição nova. Os itens precisam de data-flip="id".
 */
export function useFlip<T extends HTMLElement>(chave: unknown): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const posicoes = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const itens = Array.from(raiz.querySelectorAll<HTMLElement>("[data-flip]"));
    const novas = new Map<string, DOMRect>();
    for (const el of itens) novas.set(el.dataset.flip!, el.getBoundingClientRect());
    if (!semMovimento()) {
      for (const el of itens) {
        const antes = posicoes.current.get(el.dataset.flip!);
        const depois = novas.get(el.dataset.flip!)!;
        if (!antes) {
          el.animate([{ opacity: 0, transform: "translateY(12px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" });
          continue;
        }
        const dx = antes.left - depois.left;
        const dy = antes.top - depois.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    }
    posicoes.current = novas;
  }, [chave]);
  return ref;
}

/** Inclinação 3D que segue o dedo/mouse (cartões de produto). */
export function useInclinar(maxGraus = 8) {
  function mover(e: PointerEvent<HTMLElement>) {
    if (semMovimento()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(x * maxGraus * 2).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * maxGraus * 2).toFixed(2)}deg`);
    el.dataset.ativo = "1";
  }
  function soltar(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.ativo = "0";
  }
  return { onPointerMove: mover, onPointerDown: mover, onPointerLeave: soltar, onPointerUp: soltar, onPointerCancel: soltar };
}

/** Dispara a animação "pulo" num elemento (ex.: produto adicionado ao pedido). */
export function pular(el: Element | null) {
  if (!el || semMovimento()) return;
  el.classList.remove("pulo");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("pulo");
}
