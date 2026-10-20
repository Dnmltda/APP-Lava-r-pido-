#!/usr/bin/env node
// Etapa 8 — Auditoria de segurança (roda no servidor local ou na produção).
//
// Confere: regras de acesso de todas as coleções, o que um visitante sem login
// consegue ler ou gravar, limites de tentativas, backup automático, cabeçalhos de
// segurança e rotas só de administrador.
//
//   PB_URL=https://… PB_ADMIN_EMAIL=… PB_ADMIN_PASSWORD=… node scripts/auditar-seguranca.mjs
//   (APP_PAGE=/demo para conferir os cabeçalhos de uma tela do app)

const PB = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const PAGINA = process.env.APP_PAGE || "/";
const { PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}
let falhas = 0;
let total = 0;
function checar(descricao, ok, extra) {
  total++;
  if (ok) console.log("  ✔ " + descricao);
  else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 400) : ""));
  }
}
async function api(method, path, { token, body } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

// Únicas exceções aceitas de leitura pública (sem dados pessoais):
//   fila_sinais: só "empresa" + número da versão, para a fila atualizar ao vivo.
//   empresas / servicos: página do lava rápido (nome, logo, cor, horário) e a lista de serviços.
const LEITURA_PUBLICA = ["fila_sinais", "empresas", "servicos"];
const LOGIN = '@request.auth.id != ""';
// Coleções que só o servidor usa (nenhuma regra aberta).
const SO_SERVIDOR = ["push_chaves", "servidor_segredos"];
// Coleções que ninguém apaga pela API (histórico e dinheiro).
const SEM_APAGAR = ["auditoria", "fila_entradas", "vendas", "vendas_itens", "lancamentos_caixa", "vales", "avaliacoes", "camera_eventos"];

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD } });
  if (adm.status !== 200) throw new Error("Login do admin falhou");
  const ADM = adm.data.token;
  const cols = (await api("GET", "/api/collections?perPage=500", { token: ADM })).data.items.filter((c) => !c.system);
  const nomes = cols.map((c) => c.name);

  console.log(`Servidor: ${PB}\n\nRegras de acesso (${cols.length} coleções)`);
  checar("coleção padrão 'users' removida (ninguém cria conta por fora do app)", !nomes.includes("users"), nomes.includes("users"));
  for (const c of cols) {
    const regras = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];
    const publicas = regras.filter((r) => c[r] === "");
    const esperadoPublico = c.name === "fila_sinais" ? ["listRule", "viewRule"] : [];
    checar(`${c.name}: nenhuma regra totalmente aberta${esperadoPublico.length ? " (fora a leitura da versão da fila)" : ""}`, JSON.stringify(publicas) === JSON.stringify(esperadoPublico), publicas);
    const semLogin = regras.filter((r) => c[r] && !c[r].startsWith(LOGIN) && !(LEITURA_PUBLICA.includes(c.name) && (r === "listRule" || r === "viewRule")));
    checar(`${c.name}: toda regra exige login`, semLogin.length === 0, semLogin);
    if (SO_SERVIDOR.includes(c.name)) checar(`${c.name}: trancada (só o servidor)`, regras.every((r) => c[r] === null));
    if (SEM_APAGAR.includes(c.name)) checar(`${c.name}: ninguém apaga pela API`, c.deleteRule === null, c.deleteRule);
    if (c.type === "auth") {
      checar(`${c.name}: cadastro só pelo app (createRule trancada)`, c.createRule === null, c.createRule);
      checar(`${c.name}: senha com no mínimo 8 caracteres`, (c.fields.find((f) => f.name === "password") || {}).min >= 8);
    }
  }

  console.log("\nVisitante sem login");
  for (const c of cols) {
    const l = await api("GET", `/api/collections/${c.name}/records?perPage=1`);
    const vazio = l.status >= 400 || (l.data && l.data.totalItems === 0) || LEITURA_PUBLICA.includes(c.name);
    checar(`não lê ${c.name}`, vazio, { status: l.status, total: l.data && l.data.totalItems });
    const w = await api("POST", `/api/collections/${c.name}/records`, { body: { nome: "x" } });
    checar(`não grava em ${c.name}`, w.status >= 400, w.status);
  }
  for (const [m, rota] of [
    ["POST", "/api/lr/sensor-verificar"],
    ["GET", "/api/settings"],
    ["GET", "/api/backups"],
    ["GET", "/api/logs"],
  ]) {
    const r = await api(m, rota);
    checar(`rota de administrador fechada: ${m} ${rota}`, r.status === 401 || r.status === 403, r.status);
  }

  console.log("\nConfigurações");
  const s = (await api("GET", "/api/settings", { token: ADM })).data;
  const rl = s.rateLimits || {};
  const regra = (label) => (rl.rules || []).find((r) => r.label === label);
  checar("limite de pedidos ligado", rl.enabled === true);
  checar("limite de tentativas de login (10 a cada 5 min por IP)", regra("*:auth") && regra("*:auth").maxRequests <= 10);
  checar("limite de cadastro (5 por hora por IP)", regra("POST /api/lr/cadastro") && regra("POST /api/lr/cadastro").maxRequests <= 5);
  checar("limite geral da API", !!regra("/api/"));
  checar("backup automático diário ligado", !!(s.backups && s.backups.cron), s.backups && s.backups.cron);
  checar("guarda pelo menos 7 backups", s.backups && s.backups.cronMaxKeep >= 7, s.backups && s.backups.cronMaxKeep);
  checar("painel do administrador sem botões de editar estrutura", s.meta && s.meta.hideControls === true);
  const bks = await api("GET", "/api/backups", { token: ADM });
  checar("lista de backups acessível ao administrador", bks.status === 200, bks.status);

  console.log("\nCabeçalhos de segurança");
  const pg = await fetch(PB + PAGINA);
  const h = (n) => pg.headers.get(n) || "";
  checar("tela do app abre", pg.status === 200, pg.status);
  checar("CSP: scripts só do próprio endereço", /script-src 'self'/.test(h("content-security-policy")) && !/script-src[^;]*unsafe-inline/.test(h("content-security-policy")), h("content-security-policy"));
  checar("não deixa outro site embutir o app (anti-clickjacking)", /SAMEORIGIN|DENY/i.test(h("x-frame-options")) || /frame-ancestors/.test(h("content-security-policy")));
  checar("nosniff", /nosniff/i.test(h("x-content-type-options")));
  checar("Referrer-Policy", !!h("referrer-policy"));
  if (PB.startsWith("https://")) checar("HTTPS obrigatório (HSTS)", /max-age=\d{6,}/.test(h("strict-transport-security")), h("strict-transport-security"));
  const api404 = await fetch(PB + "/api/health");
  checar("API responde com nosniff", /nosniff/i.test(api404.headers.get("x-content-type-options") || ""));

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
