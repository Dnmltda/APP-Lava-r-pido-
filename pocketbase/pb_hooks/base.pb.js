/// <reference path="../pb_data/types.d.ts" />
// ETAPA 1 — Rotas e hooks da base: cadastro do cliente, entrada no lava rápido
// pelo link/QR, gestão da equipe pelo patrão, padrões da empresa e auditoria.

// ------------------------------------------------------------------ padrões
onRecordCreate((e) => {
  const r = e.record;
  if (!r.getInt("capacidade_simultanea")) r.set("capacidade_simultanea", 2);
  if (!r.getInt("tolerancia_min")) r.set("tolerancia_min", 10);
  if (!r.getInt("aviso_min")) r.set("aviso_min", 15);
  if (!r.getString("cor_principal")) r.set("cor_principal", "#0E7490");
  const textos = r.get("textos_aviso");
  if (!textos || String(textos) === "null" || String(textos) === "{}") {
    r.set("textos_aviso", {
      aviso_vez:
        "Faltam {minutos} minutos para a sua vez no {empresa}. Se quiser, já pode vir, temos café esperando!",
    });
  }
  e.next();
}, "empresas");

// Guarda a data do aceite de marketing (LGPD).
onRecordCreate((e) => {
  e.record.set("aceite_marketing_em", e.record.getBool("aceite_marketing") ? new DateTime() : "");
  e.next();
}, "usuarios");

onRecordUpdate((e) => {
  const antes = e.record.original().getBool("aceite_marketing");
  const agora = e.record.getBool("aceite_marketing");
  if (agora && !antes) e.record.set("aceite_marketing_em", new DateTime());
  if (!agora) e.record.set("aceite_marketing_em", "");
  e.next();
}, "usuarios");

// --------------------------------------------------- cadastro do cliente
// POST /api/lr/cadastro  { slug, nome, celular, senha, aceite_marketing }
routerAdd("POST", "/api/lr/cadastro", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({
    slug: "", nome: "", celular: "", senha: "", aceite_marketing: false,
    placa: "", final_placa: "", modelo: "", cor: "",
  });
  e.bindBody(body);

  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, body.slug);
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");

  const nome = String(body.nome || "").trim();
  const celular = lib.normalizarCelular(body.celular);
  const senha = String(body.senha || "");
  if (nome.length < 2) throw new BadRequestError("Informe seu nome.");
  if (!lib.celularValido(celular)) throw new BadRequestError("Celular inválido. Use DDD + número.");
  if (senha.length < 8) throw new BadRequestError("A senha precisa ter pelo menos 8 caracteres.");
  const placa = String(body.placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const finalPlaca = placa ? placa.slice(-3) : String(body.final_placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (placa && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) throw new BadRequestError("Placa inválida. Ex.: ABC1D23.");
  if (finalPlaca.length !== 3) throw new BadRequestError("Informe a placa ou os 3 últimos caracteres dela.");

  try {
    e.app.findFirstRecordByData("usuarios", "celular", celular);
    throw new BadRequestError("Este celular já tem cadastro. Toque em Entrar.");
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }

  e.app.runInTransaction((tx) => {
    const usuario = new Record(tx.findCollectionByNameOrId("usuarios"));
    usuario.set("nome", nome);
    usuario.set("celular", celular);
    usuario.set("aceite_marketing", !!body.aceite_marketing);
    usuario.setPassword(senha);
    tx.save(usuario);

    const vinculo = new Record(tx.findCollectionByNameOrId("vinculos"));
    vinculo.set("usuario", usuario.id);
    vinculo.set("empresa", empresa.id);
    vinculo.set("papel", "cliente");
    vinculo.set("ativo", true);
    tx.save(vinculo);

    const veiculo = new Record(tx.findCollectionByNameOrId("veiculos"));
    veiculo.set("cliente", usuario.id);
    veiculo.set("placa", placa);
    veiculo.set("final_placa", finalPlaca);
    veiculo.set("modelo", String(body.modelo || "").trim().slice(0, 60));
    veiculo.set("cor", String(body.cor || "").trim().slice(0, 30));
    tx.save(veiculo);
  });

  return e.json(201, { ok: true, celular });
});

// ------------------------------------- entrar num lava rápido pelo link/QR
// POST /api/lr/entrar/{slug}  → devolve o vínculo (cria como cliente se não houver)
routerAdd("POST", "/api/lr/entrar/{slug}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresa = lib.acharEmpresaAtivaPorSlug(e.app, e.request.pathValue("slug"));
  if (!empresa) throw new NotFoundError("Lava rápido não encontrado.");

  let vinculo = lib.acharVinculo(e.app, e.auth.id, empresa.id);
  if (vinculo && !vinculo.getBool("ativo")) {
    throw new ForbiddenError("Seu acesso a este lava rápido está desativado.");
  }
  if (!vinculo) {
    vinculo = new Record(e.app.findCollectionByNameOrId("vinculos"));
    vinculo.set("usuario", e.auth.id);
    vinculo.set("empresa", empresa.id);
    vinculo.set("papel", "cliente");
    vinculo.set("ativo", true);
    e.app.save(vinculo);
  }
  return e.json(200, { id: vinculo.id, empresa: empresa.id, ...lib.resumoVinculo(vinculo) });
}, $apis.requireAuth("usuarios"));

// --------------------------------------------- equipe: adicionar pessoa
// POST /api/lr/equipe { empresa, nome, celular, senha, papel, responsavel_fila }
// Só o patrão ativo da empresa. Se o celular já tiver conta, apenas vincula
// (não muda nome nem senha de uma conta que já existe).
routerAdd("POST", "/api/lr/equipe", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ empresa: "", nome: "", celular: "", senha: "", papel: "", responsavel_fila: false });
  e.bindBody(body);

  const empresaId = String(body.empresa || "");
  if (!lib.ehPatraoAtivo(e.app, e.auth.id, empresaId)) {
    throw new ForbiddenError("Só o patrão pode cadastrar a equipe.");
  }
  const papel = String(body.papel || "");
  if (lib.PAPEIS_EQUIPE.indexOf(papel) < 0) throw new BadRequestError("Papel inválido.");
  const celular = lib.normalizarCelular(body.celular);
  if (!lib.celularValido(celular)) throw new BadRequestError("Celular inválido. Use DDD + número.");
  const respFila = papel === "funcionario" && !!body.responsavel_fila;

  let usuario = null;
  try {
    usuario = e.app.findFirstRecordByData("usuarios", "celular", celular);
  } catch (_) {}

  const contaExistente = !!usuario;
  let resultado = null;
  e.app.runInTransaction((tx) => {
    if (!usuario) {
      const nome = String(body.nome || "").trim();
      const senha = String(body.senha || "");
      if (nome.length < 2) throw new BadRequestError("Informe o nome.");
      if (senha.length < 8) throw new BadRequestError("A senha precisa ter pelo menos 8 caracteres.");
      usuario = new Record(tx.findCollectionByNameOrId("usuarios"));
      usuario.set("nome", nome);
      usuario.set("celular", celular);
      usuario.setPassword(senha);
      tx.save(usuario);
    }

    let vinculo = lib.acharVinculo(tx, usuario.id, empresaId);
    let antes = null;
    if (vinculo) {
      if (vinculo.getString("papel") !== "cliente") {
        throw new BadRequestError("Essa pessoa já faz parte da equipe. Edite pela lista.");
      }
      antes = lib.resumoVinculo(vinculo);
    } else {
      vinculo = new Record(tx.findCollectionByNameOrId("vinculos"));
      vinculo.set("usuario", usuario.id);
      vinculo.set("empresa", empresaId);
    }
    vinculo.set("papel", papel);
    vinculo.set("responsavel_fila", respFila);
    vinculo.set("ativo", true);
    tx.save(vinculo);

    lib.auditar(tx, {
      empresa: empresaId,
      usuario: e.auth.id,
      acao: "equipe_adicionar",
      entidade: "vinculos",
      entidade_id: vinculo.id,
      antes: antes,
      depois: { nome: usuario.getString("nome"), celular: celular, ...lib.resumoVinculo(vinculo) },
    });
    resultado = { vinculo: vinculo.id, usuario: usuario.id, conta_existente: contaExistente };
  });

  return e.json(201, resultado);
}, $apis.requireAuth("usuarios"));

// --------------------------------------------- equipe: trocar senha
// POST /api/lr/equipe/senha { vinculo, senha }
// Só o patrão, só para gerente/funcionário da própria empresa, e só se a conta
// não for usada em outro lava rápido (senão o patrão mexeria numa conta alheia).
routerAdd("POST", "/api/lr/equipe/senha", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const body = new DynamicModel({ vinculo: "", senha: "" });
  e.bindBody(body);

  let vinculo;
  try {
    vinculo = e.app.findRecordById("vinculos", String(body.vinculo || ""));
  } catch (_) {
    throw new NotFoundError("Cadastro não encontrado.");
  }
  const empresaId = vinculo.getString("empresa");
  if (!lib.ehPatraoAtivo(e.app, e.auth.id, empresaId)) {
    throw new ForbiddenError("Só o patrão pode trocar senhas.");
  }
  if (lib.PAPEIS_EQUIPE.indexOf(vinculo.getString("papel")) < 0) {
    throw new ForbiddenError("Só é possível trocar a senha de gerentes e funcionários.");
  }
  const senha = String(body.senha || "");
  if (senha.length < 8) throw new BadRequestError("A senha precisa ter pelo menos 8 caracteres.");

  const outros = e.app.findRecordsByFilter(
    "vinculos", "usuario = {:u} && empresa != {:e}", "", 1, 0,
    { u: vinculo.getString("usuario"), e: empresaId },
  );
  if (outros.length > 0) {
    throw new BadRequestError("Essa pessoa usa a mesma conta em outro lava rápido. Peça para ela mesma trocar a senha.");
  }

  const usuario = e.app.findRecordById("usuarios", vinculo.getString("usuario"));
  usuario.setPassword(senha); // também derruba as sessões abertas
  e.app.save(usuario);

  lib.auditar(e.app, {
    empresa: empresaId,
    usuario: e.auth.id,
    acao: "equipe_trocar_senha",
    entidade: "usuarios",
    entidade_id: usuario.id,
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

// ---------------------------------------------------------- auditoria
// Alterações de vínculo (papel, responsável pela fila, ativar/desativar).
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const antes = lib.resumoVinculo(e.record.original());
  e.next();
  lib.auditar(e.app, {
    empresa: e.record.getString("empresa"),
    usuario: e.auth ? e.auth.id : "",
    acao: "equipe_editar",
    entidade: "vinculos",
    entidade_id: e.record.id,
    antes: antes,
    depois: lib.resumoVinculo(e.record),
  });
}, "vinculos");

// Alterações nas configurações da empresa.
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const campos = ["nome", "cor_principal", "whatsapp", "endereco", "capacidade_simultanea",
    "tolerancia_min", "aviso_min", "textos_aviso", "horario_funcionamento", "logo"];
  const original = e.record.original();
  const antes = {};
  for (const c of campos) antes[c] = original.get(c);
  e.next();
  const depois = {};
  for (const c of campos) depois[c] = e.record.get(c);
  lib.auditar(e.app, {
    empresa: e.record.id,
    usuario: e.auth ? e.auth.id : "",
    acao: "empresa_configurar",
    entidade: "empresas",
    entidade_id: e.record.id,
    antes: antes,
    depois: depois,
  });
}, "empresas");

// Auditoria imutável: ninguém edita, nem o superusuário. Apagar só é aceito
// para empresas de teste (slug "teste-*"), usado pelo script de testes.
onRecordUpdate((e) => {
  throw new ForbiddenError("A auditoria não pode ser alterada.");
}, "auditoria");

onRecordDelete((e) => {
  let slug = "";
  try {
    slug = e.app.findRecordById("empresas", e.record.getString("empresa")).getString("slug");
  } catch (_) {}
  if (slug.indexOf("teste-") !== 0) {
    throw new ForbiddenError("A auditoria não pode ser apagada.");
  }
  e.next();
}, "auditoria");
