/// <reference path="../pb_data/types.d.ts" />
// ETAPA 7 — Câmeras (só o patrão).
//
// Tipos de integração (seção 2.6 do planejamento):
//   app_fabricante — Opção A: botão que abre o app/nuvem oficial (Intelbras, Hikvision…).
//   imagem         — Opção B: gateway local (go2rtc/MediaMTX) devolve uma foto atual
//                    (ex.: go2rtc /api/frame.jpeg?src=cam1); o app atualiza a cada segundo.
//   hls            — Opção B: vídeo ao vivo HLS do gateway (ex.: MediaMTX /cam1/index.m3u8).
//   demonstracao   — imagem gerada pelo próprio servidor, para testar a tela sem câmera.
// O endereço do gateway e o token NUNCA chegam ao celular: o servidor busca a
// imagem/vídeo com o token e repassa só para quem tem um passe temporário,
// emitido apenas para o patrão (rota /api/lr/cameras/{id}/acesso).
// Nunca abrir a porta do DVR para a internet.
migrate((app) => {
  const empresas = app.findCollectionByNameOrId("empresas");

  const patrao =
    '(@request.auth.id != "" && @collection.vinculos:eu.usuario ?= @request.auth.id && ' +
    "@collection.vinculos:eu.empresa ?= EMPRESA && @collection.vinculos:eu.ativo ?= true && " +
    '@collection.vinculos:eu.papel ?= "patrao")';

  const cameras = new Collection({
    type: "base",
    name: "cameras",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "nome", required: true, max: 60 },
      { type: "select", name: "tipo_integracao", required: true, maxSelect: 1, values: ["app_fabricante", "imagem", "hls", "demonstracao"] },
      // Opção B: endereço HTTPS do gateway (ex.: túnel Cloudflare) + caminho do stream
      { type: "url", name: "endereco_stream" },
      { type: "text", name: "caminho", max: 300 },
      // Nunca volta nas respostas da API, nem para o patrão (onRecordEnrich esconde).
      { type: "text", name: "gateway_token", max: 200 },
      // Opção A: link do app/nuvem do fabricante
      { type: "url", name: "link_app" },
      { type: "number", name: "ordem", onlyInt: true },
      { type: "bool", name: "ativo" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_cameras_empresa ON cameras (empresa)"],
  });
  cameras.listRule = patrao.replace("EMPRESA", "empresa");
  cameras.viewRule = cameras.listRule;
  cameras.createRule = patrao.replace("EMPRESA", "@request.body.empresa");
  cameras.updateRule = patrao.replace("EMPRESA", "empresa") + " && @request.body.empresa:changed = false";
  cameras.deleteRule = patrao.replace("EMPRESA", "empresa");
  app.save(cameras);

  // Segredos do servidor (assinatura dos passes de câmera etc.). Sem regras: só os hooks.
  const segredos = new Collection({
    type: "base",
    name: "servidor_segredos",
    fields: [
      { type: "text", name: "nome", required: true, max: 60 },
      { type: "text", name: "valor", required: true, max: 200 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_segredos_nome ON servidor_segredos (nome)"],
  });
  app.save(segredos);

  // A tela de câmeras pede uma imagem por segundo: limite próprio, mais alto que o geral.
  const settings = app.settings();
  const regras = (settings.rateLimits.rules || []).filter((r) => r.label !== "/api/lr/cameras/");
  regras.push({ label: "/api/lr/cameras/", audience: "", duration: 60, maxRequests: 900 });
  settings.rateLimits.rules = regras;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.rateLimits.rules = (settings.rateLimits.rules || []).filter((r) => r.label !== "/api/lr/cameras/");
  app.save(settings);
  for (const nome of ["servidor_segredos", "cameras"]) {
    try {
      app.delete(app.findCollectionByNameOrId(nome));
    } catch (_) {}
  }
});
