#!/usr/bin/env node
// Teste: chave do sensor e endereço do gateway das câmeras (auditoria 24/10/2026, S3). Quem só pode VER
// as câmeras não descobre esses dados nem filtrando, nem pelo histórico do sensor, nem pelo tempo real.
//
//   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/testar-privacidade-cameras.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}
const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 300) : ""));
  }
}
async function api(method, path, { token, body, form } = {}, tentativa = 0) {
  const res = await fetch(PB + path, {
    method,
    headers: { ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: token } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  if (res.status === 429 && tentativa < 15) {
    await new Promise((r) => setTimeout(r, 5000));
    return api(method, path, { token, body, form }, tentativa + 1);
  }
  const texto = await res.text();
  let data = null;
  try {
    data = JSON.parse(texto);
  } catch {}
  return { status: res.status, data, texto };
}
const ok = (r) => r.status >= 200 && r.status < 300;
const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400;
const qs = encodeURIComponent;
// Imagem PNG 1x1 e um PDF mínimo (arquivos de verdade, o servidor confere o tipo pelo conteúdo).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

// Abre o tempo real do PocketBase e tenta assinar com filtro. Devolve o status da assinatura.
async function assinar(token, assinatura) {
  const ctl = new AbortController();
  const res = await fetch(PB + "/api/realtime", { signal: ctl.signal });
  const leitor = res.body.getReader();
  let texto = "";
  let clientId = "";
  for (let i = 0; i < 20 && !clientId; i++) {
    const { value, done } = await leitor.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
    clientId = (/"clientId":"([^"]+)"/.exec(texto) || [])[1] || "";
  }
  const r = await api("POST", "/api/realtime", { token, body: { clientId, subscriptions: [assinatura] } });
  ctl.abort();
  return r.status;
}

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD } });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token: ADM, body });
    if (!ok(r)) throw new Error(`Falha ao criar ${col}: ${r.texto}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  let seq = 0;
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", { nome, celular: "116" + sufixo + String(seq++).padStart(2, "0"), password: "senha12345", passwordConfirm: "senha12345" });
    await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    const t = await api("POST", `/api/collections/usuarios/impersonate/${u.id}`, { token: ADM, body: { duration: 1800 } });
    return { id: u.id, token: t.data.token };
  };

  try {
    console.log("Preparando…");
    const A = await criar("empresas", { nome: "Teste Câmeras Privadas", slug: "teste-camp-" + sufixo, ativo: true });
    const patrao = await pessoa("Dono", A, "patrao");
    const gerente = await pessoa("Gerente com câmeras", A, "gerente", { perm_cameras: true });
    const func = await pessoa("Funcionário com câmeras", A, "funcionario", { perm_cameras: true });
    let r = await api("POST", "/api/collections/cameras/records", {
      token: patrao.token,
      body: { empresa: A.id, nome: "Box 1", tipo_integracao: "app_fabricante", link_app: "https://exemplo.com.br", ativo: true, monitorar_movimento: true, sem_movimento_min: 10 },
    });
    checar("dono cadastra a câmera", r.status === 200, r.data);
    const cam = r.data;
    const chave = cam?.chave_sensor || "";
    checar("dono recebe a chave do sensor (para configurar o gateway)", chave.length === 40, chave.length);
    r = await api("POST", `/api/lr/sensor/${chave}`, { body: { tipo: "movimento" } });
    checar("sensor aceita a chave certa", r.status === 204, r.status);

    for (const [rotulo, p] of [["gerente", gerente], ["funcionário", func]]) {
      console.log(`\n${rotulo} com acesso às câmeras`);
      r = await api("GET", `/api/collections/cameras/records/${cam.id}`, { token: p.token });
      checar("vê a câmera", r.status === 200, r.status);
      checar("não recebe chave, endereço, caminho nem token", r.data && !("chave_sensor" in r.data) && !("endereco_stream" in r.data) && !("caminho" in r.data) && !("gateway_token" in r.data), Object.keys(r.data || {}));
      for (const filtro of ['chave_sensor~"a%"', 'endereco_stream~"http%"', 'caminho~"/"', 'gateway_token~"a%"']) {
        r = await api("GET", `/api/collections/cameras/records?filter=${qs(filtro)}`, { token: p.token });
        checar(`câmeras: filtro por ${filtro.split("~")[0]} recusado`, r.status === 400, r.status);
      }
      r = await api("GET", `/api/collections/cameras/records?sort=chave_sensor`, { token: p.token });
      checar("câmeras: ordenar pela chave recusado", r.status === 400, r.status);
      r = await api("GET", `/api/collections/camera_eventos/records`, { token: p.token });
      checar("vê o histórico do sensor", r.status === 200 && r.data.items.length >= 1, r.data);
      for (const filtro of ['camera.chave_sensor~"a%"', 'camera.CHAVE_SENSOR~"a%"', 'camera.endereco_stream~"h%"', 'camera.gateway_token~"a%"']) {
        r = await api("GET", `/api/collections/camera_eventos/records?filter=${qs(filtro)}`, { token: p.token });
        checar(`histórico: filtro por ${filtro.split("~")[0]} recusado`, r.status === 400, r.status);
      }
      r = await api("GET", `/api/collections/camera_eventos/records?sort=camera.chave_sensor`, { token: p.token });
      checar("histórico: ordenar pela chave da câmera recusado", r.status === 400, r.status);
      const st = await assinar(p.token, `cameras?options=${encodeURIComponent(JSON.stringify({ query: { filter: 'chave_sensor~"a%"' } }))}`);
      checar("tempo real: assinar câmeras filtrando pela chave recusado", st === 400, st);
      const st2 = await assinar(p.token, `camera_eventos?options=${encodeURIComponent(JSON.stringify({ query: { filter: 'camera.chave_sensor~"a%"' } }))}`);
      checar("tempo real: assinar histórico filtrando pela chave recusado", st2 === 400, st2);
    }

    console.log("\nDono e uso normal");
    r = await api("GET", `/api/collections/cameras/records/${cam.id}`, { token: patrao.token });
    checar("dono continua recebendo chave e configuração", r.data?.chave_sensor === chave && "endereco_stream" in r.data && !("gateway_token" in r.data), Object.keys(r.data || {}));
    r = await api("PATCH", `/api/collections/cameras/records/${cam.id}`, { token: patrao.token, body: { nome: "Box 1 (entrada)" } });
    checar("dono continua editando a câmera", r.status === 200 && r.data.nome === "Box 1 (entrada)", r.data);
    const st3 = await assinar(gerente.token, "cameras");
    checar("tempo real sem filtro continua funcionando", st3 === 204, st3);
    r = await api("GET", `/api/collections/cameras/records?filter=${qs('nome~"Box"')}`, { token: gerente.token });
    checar("filtro comum (pelo nome) continua funcionando", r.status === 200 && r.data.items.length === 1, r.status);
  } catch (err) {
    falhas++;
    console.log("  ✘ erro inesperado: " + (err.stack || err));
  } finally {
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
  }
  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main();
