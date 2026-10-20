// White-label: a cor principal de cada lava rápido vira variáveis CSS.
const PADRAO = "#0E7490";

function rgb(hex: string): [number, number, number] {
  const h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : PADRAO;
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminancia([r, g, b]: [number, number, number]) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function misturar([r, g, b]: [number, number, number], alvo: number, peso: number) {
  const m = (v: number) => Math.round(v + (alvo - v) * peso);
  return `rgb(${m(r)} ${m(g)} ${m(b)})`;
}

export function aplicarTema(cor: string | undefined) {
  const base = rgb(cor || PADRAO);
  // Texto sobre a cor: branco ou quase-preto, o que der mais contraste.
  const L = luminancia(base);
  const contrasteBranco = 1.05 / (L + 0.05);
  const contrastePreto = (L + 0.05) / 0.05;
  const raiz = document.documentElement.style;
  raiz.setProperty("--marca", `rgb(${base.join(" ")})`);
  raiz.setProperty("--marca-forte", misturar(base, 0, 0.25));
  raiz.setProperty("--marca-suave", misturar(base, 255, 0.88));
  raiz.setProperty("--sobre-marca", contrasteBranco >= contrastePreto ? "#ffffff" : "#111827");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", `rgb(${base.join(" ")})`);
}

export function temaPadrao() {
  aplicarTema(PADRAO);
}
