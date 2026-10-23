// Identidade visual DNM&LTDA: as cores são as mesmas para todos os lava rápidos
// (decisão do Diego, 23/10/2026). A cor que o lava rápido tinha escolhido fica
// guardada no cadastro, mas não muda mais o app.
export const COR_DNM = {
  marinho: "#0A1F4D",
  royal: "#1E40AF",
  dourado: "#E5B339",
  douradoEscuro: "#B8862B",
  creme: "#F7EFDC",
};

export function aplicarTema(_cor?: string) {
  const raiz = document.documentElement.style;
  raiz.setProperty("--marca", COR_DNM.royal);
  raiz.setProperty("--marca-forte", COR_DNM.marinho);
  raiz.setProperty("--marca-suave", "#E7ECF8");
  raiz.setProperty("--sobre-marca", "#ffffff");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_DNM.marinho);
}

export function temaPadrao() {
  aplicarTema();
}
