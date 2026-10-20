/// <reference path="../pb_data/types.d.ts" />
// Sensor de movimento das câmeras (só funciona se a câmera/DVR tiver detecção de movimento).
//
// O DVR (ou o gateway da loja, scripts em deploy/gateway) avisa o servidor em
// POST /api/lr/sensor/{chave}: "movimento" quando a câmera detecta movimento e
// "sinal" a cada minuto (para saber que o sensor está ligado).
// No horário de funcionamento, se a área ficar sem movimento por X minutos
// (padrão 10), o patrão recebe um alerta no celular.
migrate((app) => {
  const cameras = app.findCollectionByNameOrId("cameras");
  cameras.fields.add(new BoolField({ name: "monitorar_movimento" }));
  cameras.fields.add(new NumberField({ name: "sem_movimento_min", onlyInt: true, min: 0, max: 240 }));
  // Chave secreta da URL de eventos (gerada pelo servidor; só o patrão vê).
  cameras.fields.add(new TextField({ name: "chave_sensor", max: 64 }));
  cameras.fields.add(new DateField({ name: "ultimo_movimento_em" }));
  cameras.fields.add(new DateField({ name: "ultimo_sinal_em" }));
  cameras.fields.add(new DateField({ name: "alerta_parado_em" }));
  cameras.fields.add(new DateField({ name: "alerta_desligado_em" }));
  // Desde quando o sensor está vigiando (ligou o sensor ou ele voltou a responder).
  cameras.fields.add(new DateField({ name: "sensor_desde_em" }));
  cameras.indexes.push("CREATE UNIQUE INDEX idx_cameras_chave_sensor ON cameras (chave_sensor) WHERE chave_sensor != ''");
  app.save(cameras);
  for (const c of app.findAllRecords("cameras")) {
    c.set("chave_sensor", $security.randomString(40));
    c.set("sem_movimento_min", 10);
    app.unsafeWithoutHooks().save(c);
  }

  const empresas = app.findCollectionByNameOrId("empresas");
  const patrao =
    '@request.auth.id != "" && @collection.vinculos:eu.usuario ?= @request.auth.id && ' +
    "@collection.vinculos:eu.empresa ?= empresa && @collection.vinculos:eu.ativo ?= true && " +
    '@collection.vinculos:eu.papel ?= "patrao"';
  const eventos = new Collection({
    type: "base",
    name: "camera_eventos",
    fields: [
      { type: "relation", name: "empresa", required: true, collectionId: empresas.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "camera", required: true, collectionId: cameras.id, maxSelect: 1, cascadeDelete: true },
      // movimento | parado (alerta enviado) | desligado (sensor parou de responder) | religado
      { type: "select", name: "tipo", required: true, maxSelect: 1, values: ["movimento", "parado", "desligado", "religado"] },
      { type: "number", name: "minutos" },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_camera_eventos ON camera_eventos (camera, created)"],
  });
  // Só leitura, só o patrão. Quem grava é o servidor.
  eventos.listRule = patrao;
  eventos.viewRule = patrao;
  app.save(eventos);

  const settings = app.settings();
  const regras = (settings.rateLimits.rules || []).filter((r) => r.label !== "POST /api/lr/sensor/");
  regras.push({ label: "POST /api/lr/sensor/", audience: "", duration: 60, maxRequests: 600 });
  settings.rateLimits.rules = regras;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.rateLimits.rules = (settings.rateLimits.rules || []).filter((r) => r.label !== "POST /api/lr/sensor/");
  app.save(settings);
  try {
    app.delete(app.findCollectionByNameOrId("camera_eventos"));
  } catch (_) {}
  const cameras = app.findCollectionByNameOrId("cameras");
  for (const n of ["monitorar_movimento", "sem_movimento_min", "chave_sensor", "ultimo_movimento_em", "ultimo_sinal_em", "alerta_parado_em", "alerta_desligado_em", "sensor_desde_em"]) {
    cameras.fields.removeByName(n);
  }
  cameras.indexes = cameras.indexes.filter((i) => i.indexOf("idx_cameras_chave_sensor") < 0);
  app.save(cameras);
});
