/// <reference path="../pb_data/types.d.ts" />
// ETAPA 8 — Cabeçalhos de segurança em todas as respostas.
// As telas do app (fora de /api/ e /_/) também recebem uma política de conteúdo (CSP):
// só carregam scripts, estilos e dados do próprio endereço.
routerUse((e) => {
  const h = e.response.header();
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (e.request.tls || e.request.header.get("X-Forwarded-Proto") === "https") {
    h.set("Strict-Transport-Security", "max-age=31536000");
  }
  const caminho = e.request.url.path;
  if (caminho.indexOf("/api/") !== 0 && caminho.indexOf("/_/") !== 0) {
    h.set("X-Frame-Options", "SAMEORIGIN");
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; " +
        "font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; " +
        "manifest-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"
    );
  }
  return e.next();
});
