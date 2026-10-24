#!/usr/bin/env node
// Teste da Etapa 1: cada perfil vê só o seu; empresa A não vê a B.
// Roda contra um PocketBase de DESENVOLVIMENTO (cria e apaga dados "teste-*").
//
//   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... \
//     node scripts/testar-isolamento.mjs

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Defina PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD.");
  process.exit(2);
}

const sufixo = Date.now().toString().slice(-6);
let falhas = 0;
let total = 0;

async function api(method, path, { token, body } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

function checar(descricao, ok, extra) {
  total++;
  if (ok) {
    console.log("  ✔ " + descricao);
  } else {
    falhas++;
    console.log("  ✘ " + descricao + (extra !== undefined ? "  → " + JSON.stringify(extra) : ""));
  }
}

const negado = (r) => r.status === 403 || r.status === 404 || r.status === 400;
const ids = (r) => (r.data?.items || []).map((i) => i.id);

async function main() {
  const adm = await api("POST", "/api/collections/_superusers/auth-with-password", {
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (adm.status !== 200) throw new Error("Login do admin falhou: " + JSON.stringify(adm.data));
  const ADM = adm.data.token;

  const criados = { empresas: [], usuarios: [] };
  const criar = async (col, body) => {
    const r = await api("POST", `/api/collections/${col}/records`, { token: ADM, body });
    if (r.status !== 200) throw new Error(`Falha ao criar ${col}: ${JSON.stringify(r.data)}`);
    if (criados[col]) criados[col].push(r.data.id);
    return r.data;
  };
  const tokenDe = async (usuarioId) => {
    const r = await api("POST", `/api/collections/usuarios/impersonate/${usuarioId}`, {
      token: ADM, body: { duration: 600 },
    });
    return r.data.token;
  };

  let celularSeq = 0;
  const novoCelular = () => "119" + sufixo + String(celularSeq++).padStart(2, "0");
  const pessoa = async (nome, empresa, papel, extra = {}) => {
    const u = await criar("usuarios", {
      nome, celular: novoCelular(), password: "senha12345", passwordConfirm: "senha12345",
    });
    const v = await criar("vinculos", { usuario: u.id, empresa: empresa.id, papel, ativo: true, ...extra });
    return { usuario: u, vinculo: v, token: await tokenDe(u.id) };
  };

  try {
    console.log("Preparando dados de teste…");
    const A = await criar("empresas", { nome: "Teste A", slug: "teste-a-" + sufixo, ativo: true });
    const B = await criar("empresas", { nome: "Teste B", slug: "teste-b-" + sufixo, ativo: true });
    const C = await criar("empresas", { nome: "Teste C inativa", slug: "teste-c-" + sufixo, ativo: false });

    const patraoA = await pessoa("Patrão A", A, "patrao");
    const gerenteA = await pessoa("Gerente A", A, "gerente");
    const funcA = await pessoa("Funcionário A", A, "funcionario");
    const respA = await pessoa("Responsável A", A, "funcionario", { responsavel_fila: true });
    const inativoA = await pessoa("Inativo A", A, "funcionario", { ativo: false });
    const patraoB = await pessoa("Patrão B", B, "patrao");
    const funcB = await pessoa("Funcionário B", B, "funcionario");
    const clienteB = await pessoa("Cliente B", B, "cliente");

    // ------------------------------------------------------------ público
    console.log("\nVisitante (sem login)");
    let r = await api("GET", `/api/collections/empresas/records?perPage=500`);
    checar("vê empresas ativas", ids(r).includes(A.id) && ids(r).includes(B.id));
    checar("não vê empresa inativa", !ids(r).includes(C.id));
    r = await api("GET", `/api/collections/usuarios/records`);
    checar("não lista usuários", (r.data?.items || []).length === 0 || negado(r), r.data);
    r = await api("GET", `/api/collections/vinculos/records`);
    checar("não lista vínculos", (r.data?.items || []).length === 0 || negado(r), r.data);
    r = await api("POST", `/api/collections/usuarios/records`, {
      body: { nome: "X", celular: "11900000000", password: "senha12345", passwordConfirm: "senha12345" },
    });
    checar("não cria usuário direto pela API", negado(r), r.status);

    // ----------------------------------------------------------- cadastro
    console.log("\nCadastro do cliente pelo link da empresa A");
    const celCliente = novoCelular();
    r = await api("POST", "/api/lr/cadastro", {
      body: { slug: A.slug, nome: "Cliente A", celular: celCliente, senha: "senha12345", aceite_marketing: true, placa: "ABC1D23", modelo: "Onix", cor: "Prata" },
    });
    checar("cadastro aceito", r.status === 201, r.data);
    r = await api("POST", "/api/lr/cadastro", {
      body: { slug: C.slug, nome: "Cliente C", celular: novoCelular(), senha: "senha12345", final_placa: "123", modelo: "Onix", cor: "Prata" },
    });
    checar("cadastro em empresa inativa é recusado", r.status === 404, r.status);
    r = await api("POST", "/api/lr/cadastro", {
      body: { slug: A.slug, nome: "Repetido", celular: celCliente, senha: "senha12345", final_placa: "123", modelo: "Onix", cor: "Prata" },
    });
    checar("celular repetido é recusado", r.status === 400, r.status);
    r = await api("POST", "/api/collections/usuarios/auth-with-password", {
      body: { identity: celCliente, password: "senha12345" },
    });
    checar("cliente loga com celular + senha", r.status === 200, r.data);
    const clienteA = { usuario: r.data.record, token: r.data.token };
    criados.usuarios.push(clienteA.usuario.id);
    checar("data do aceite de marketing gravada", !!clienteA.usuario.aceite_marketing_em, clienteA.usuario);
    r = await api("POST", "/api/collections/usuarios/auth-with-password", {
      body: { identity: celCliente, password: "errada123" },
    });
    checar("senha errada é recusada", r.status === 400, r.status);

    // ------------------------------------------------------------ cliente
    console.log("\nCliente A");
    r = await api("GET", `/api/collections/vinculos/records`, { token: clienteA.token });
    checar("vê só o próprio vínculo", r.data.items.length === 1 && r.data.items[0].usuario === clienteA.usuario.id, r.data);
    const vincClienteA = r.data.items[0];
    checar("vínculo criado como cliente", vincClienteA?.papel === "cliente", vincClienteA);
    r = await api("GET", `/api/collections/usuarios/records`, { token: clienteA.token });
    checar("vê só o próprio usuário", r.data.items.length === 1, ids(r));
    r = await api("PATCH", `/api/collections/vinculos/records/${vincClienteA.id}`, {
      token: clienteA.token, body: { papel: "patrao" },
    });
    checar("não se promove a patrão", negado(r), r.status);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: clienteA.token, body: { nome: "Hack" } });
    checar("não edita a empresa", negado(r), r.status);
    r = await api("GET", `/api/collections/auditoria/records`, { token: clienteA.token });
    checar("não vê auditoria", r.data.items.length === 0, r.data);
    r = await api("POST", `/api/lr/entrar/${B.slug}`, { token: clienteA.token });
    checar("entra no lava rápido B pelo link (vira cliente lá)", r.status === 200 && r.data.papel === "cliente", r.data);
    r = await api("PATCH", `/api/collections/usuarios/records/${clienteA.usuario.id}`, {
      token: clienteA.token, body: { nome: "Cliente A Editado" },
    });
    checar("edita o próprio nome", r.status === 200, r.data);
    r = await api("PATCH", `/api/collections/usuarios/records/${funcA.usuario.id}`, {
      token: clienteA.token, body: { nome: "Hack" },
    });
    checar("não edita outro usuário", negado(r), r.status);

    // -------------------------------------------------------- funcionário
    for (const [rotulo, p] of [["Funcionário A", funcA], ["Gerente A", gerenteA], ["Responsável pela fila A", respA]]) {
      console.log("\n" + rotulo);
      r = await api("GET", `/api/collections/usuarios/records?perPage=500`, { token: p.token });
      const vistos = ids(r);
      // Auditoria 24/10/2026 (S1): sem "Lista de clientes", a equipe vê a equipe, mas não cliente fora de atendimento.
      checar("vê a equipe da empresa A", vistos.includes(patraoA.usuario.id), vistos);
      checar("não vê cliente da A fora de atendimento (sem 'Lista de clientes')", !vistos.includes(clienteA.usuario.id), vistos);
      checar("não vê ninguém só da empresa B", !vistos.includes(patraoB.usuario.id) && !vistos.includes(funcB.usuario.id) && !vistos.includes(clienteB.usuario.id), vistos);
      r = await api("GET", `/api/collections/vinculos/records?perPage=500`, { token: p.token });
      const vv = r.data.items;
      checar("vê só vínculos da empresa A", vv.length > 0 && vv.every((v) => v.empresa === A.id), vv.map((v) => v.empresa));
      checar("não vê vínculos de clientes", vv.every((v) => v.papel !== "cliente"), vv.map((v) => v.papel));
      r = await api("PATCH", `/api/collections/vinculos/records/${funcA.vinculo.id}`, { token: p.token, body: { ativo: false } });
      checar("não altera cadastro da equipe", negado(r), r.status);
      r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: p.token, body: { nome: "Hack" } });
      checar("não edita configurações da empresa", negado(r), r.status);
      r = await api("POST", `/api/lr/equipe`, {
        token: p.token, body: { empresa: A.id, nome: "Novo", celular: novoCelular(), senha: "senha12345", papel: "funcionario" },
      });
      checar("não cadastra equipe", r.status === 403, r.status);
      r = await api("POST", `/api/lr/equipe/senha`, { token: p.token, body: { vinculo: funcA.vinculo.id, senha: "novasenha123" } });
      checar("não troca senha de outros", r.status === 403, r.status);
      r = await api("GET", `/api/collections/auditoria/records`, { token: p.token });
      checar("não vê auditoria", r.data.items.length === 0, r.data.items.length);
    }

    // ---------------------------------------------------- funcionário inativo
    console.log("\nFuncionário A desativado");
    r = await api("GET", `/api/collections/usuarios/records?perPage=500`, { token: inativoA.token });
    checar("vê só a si mesmo", r.data.items.length === 1 && r.data.items[0].id === inativoA.usuario.id, ids(r));
    r = await api("POST", `/api/lr/entrar/${A.slug}`, { token: inativoA.token });
    checar("acesso à empresa recusado", r.status === 403, r.status);

    // ------------------------------------------------------------- patrão
    console.log("\nPatrão A");
    r = await api("GET", `/api/collections/vinculos/records?perPage=500`, { token: patraoA.token });
    checar("vê todos os vínculos da A (inclusive clientes)", r.data.items.some((v) => v.id === vincClienteA.id), r.data.items.length);
    checar("não vê vínculos da B", r.data.items.every((v) => v.empresa === A.id), r.data.items.map((v) => v.empresa));
    r = await api("GET", `/api/collections/usuarios/records?perPage=500`, { token: patraoA.token });
    checar("não vê pessoas só da B", !ids(r).includes(patraoB.usuario.id) && !ids(r).includes(clienteB.usuario.id), ids(r));
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patraoA.token, body: { cor_principal: "#123456" } });
    checar("edita a própria empresa", r.status === 200, r.data);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patraoA.token, body: { slug: "outro-" + sufixo } });
    checar("não troca o endereço (slug)", negado(r), r.status);
    r = await api("PATCH", `/api/collections/empresas/records/${A.id}`, { token: patraoA.token, body: { ativo: false } });
    checar("não ativa/desativa a empresa (é da DNM)", negado(r), r.status);
    r = await api("PATCH", `/api/collections/empresas/records/${B.id}`, { token: patraoA.token, body: { nome: "Hack" } });
    checar("não edita a empresa B", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${funcA.vinculo.id}`, { token: patraoA.token, body: { responsavel_fila: true } });
    checar("liga 'responsável pela fila' num funcionário", r.status === 200 && r.data.responsavel_fila === true, r.data);
    r = await api("PATCH", `/api/collections/vinculos/records/${funcA.vinculo.id}`, { token: patraoA.token, body: { papel: "patrao" } });
    checar("não promove ninguém a patrão", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${funcA.vinculo.id}`, { token: patraoA.token, body: { empresa: B.id } });
    checar("não move vínculo para outra empresa", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${patraoA.vinculo.id}`, { token: patraoA.token, body: { ativo: false } });
    checar("não desativa a si mesmo", negado(r), r.status);
    r = await api("PATCH", `/api/collections/vinculos/records/${funcB.vinculo.id}`, { token: patraoA.token, body: { ativo: false } });
    checar("não altera equipe da B", negado(r), r.status);
    r = await api("POST", `/api/lr/equipe`, {
      token: patraoA.token, body: { empresa: B.id, nome: "Intruso", celular: novoCelular(), senha: "senha12345", papel: "gerente" },
    });
    checar("não cadastra equipe na B", r.status === 403, r.status);
    r = await api("POST", `/api/lr/equipe/senha`, { token: patraoA.token, body: { vinculo: funcB.vinculo.id, senha: "novasenha123" } });
    checar("não troca senha da equipe da B", r.status === 403, r.status);
    r = await api("POST", `/api/lr/equipe/senha`, { token: patraoA.token, body: { vinculo: vincClienteA.id, senha: "novasenha123" } });
    checar("não troca senha de cliente", r.status === 403, r.status);

    const celNovo = novoCelular();
    r = await api("POST", `/api/lr/equipe`, {
      token: patraoA.token, body: { empresa: A.id, nome: "Novo Func", celular: celNovo, senha: "senha12345", papel: "funcionario" },
    });
    checar("cadastra funcionário novo", r.status === 201, r.data);
    if (r.data?.usuario) criados.usuarios.push(r.data.usuario);
    const vincNovo = r.data?.vinculo;
    r = await api("POST", `/api/lr/equipe/senha`, { token: patraoA.token, body: { vinculo: vincNovo, senha: "trocada123" } });
    checar("troca senha do funcionário", r.status === 200, r.data);
    r = await api("POST", "/api/collections/usuarios/auth-with-password", { body: { identity: celNovo, password: "trocada123" } });
    checar("funcionário loga com a senha nova", r.status === 200, r.status);

    r = await api("POST", `/api/lr/equipe`, {
      token: patraoA.token, body: { empresa: A.id, celular: clienteA.usuario.celular, papel: "gerente" },
    });
    checar("promove cliente existente a gerente sem mexer na senha", r.status === 201 && r.data.conta_existente === true, r.data);
    r = await api("POST", `/api/lr/equipe/senha`, { token: patraoA.token, body: { vinculo: r.data?.vinculo, senha: "novasenha123" } });
    checar("não troca senha de conta usada em outro lava rápido", r.status === 400, r.status);

    r = await api("GET", `/api/collections/auditoria/records?perPage=500`, { token: patraoA.token });
    const acoes = r.data.items.map((a) => a.acao);
    checar("auditoria da A registra as ações", ["equipe_adicionar", "equipe_editar", "equipe_trocar_senha", "empresa_configurar"].every((a) => acoes.includes(a)), acoes);
    checar("auditoria só da empresa A", r.data.items.every((a) => a.empresa === A.id));
    const umaAud = r.data.items[0];
    r = await api("PATCH", `/api/collections/auditoria/records/${umaAud.id}`, { token: patraoA.token, body: { motivo: "x" } });
    checar("patrão não edita auditoria", negado(r), r.status);
    r = await api("DELETE", `/api/collections/auditoria/records/${umaAud.id}`, { token: patraoA.token });
    checar("patrão não apaga auditoria", negado(r), r.status);

    console.log("\nPatrão B");
    r = await api("GET", `/api/collections/auditoria/records?perPage=500`, { token: patraoB.token });
    checar("não vê auditoria da A", r.data.items.every((a) => a.empresa === B.id), r.data.items.length);
    r = await api("GET", `/api/collections/vinculos/records?perPage=500`, { token: patraoB.token });
    checar("vê só vínculos da B", r.data.items.every((v) => v.empresa === B.id));

    // ------------------------------------------------------ limpeza
    console.log("\nLimpando dados de teste…");
    // A auditoria é imutável; o servidor só deixa o superusuário apagar a de
    // empresas de teste (slug "teste-*").
    const aud = await api("GET", `/api/collections/auditoria/records?perPage=500&filter=${encodeURIComponent(`empresa="${A.id}" || empresa="${B.id}"`)}`, { token: ADM });
    for (const a of aud.data.items) await api("DELETE", `/api/collections/auditoria/records/${a.id}`, { token: ADM });
  } finally {
    // Empresa primeiro (leva junto lavagens, vendas e histórico do teste), depois as pessoas.
    for (const id of criados.empresas) await api("DELETE", `/api/collections/empresas/records/${id}`, { token: ADM });
    for (const id of criados.usuarios) await api("DELETE", `/api/collections/usuarios/records/${id}`, { token: ADM });
  }

  console.log(`\n${total - falhas}/${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
