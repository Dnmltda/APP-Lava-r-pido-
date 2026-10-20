/// <reference path="../pb_data/types.d.ts" />
// Lista de clientes: só o dono, ou quem o dono liberar (acesso "clientes").

// GET /api/lr/clientes/{empresa}
routerAdd("GET", "/api/lr/clientes/{empresa}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  if (!lib.temAcesso(e.app, e.auth.id, empresaId, "clientes")) throw new ForbiddenError("Só o dono (ou quem ele liberar) vê a lista de clientes.");
  const lista = lib.listaClientes(e.app, empresaId);
  return e.json(200, { total: lista.length, clientes: lista });
}, $apis.requireAuth("usuarios"));

// GET /api/lr/clientes/{empresa}/{usuario}  — histórico completo de um cliente, com valores.
routerAdd("GET", "/api/lr/clientes/{empresa}/{usuario}", (e) => {
  const lib = require(`${__hooks}/lib.js`);
  const empresaId = e.request.pathValue("empresa");
  if (!lib.temAcesso(e.app, e.auth.id, empresaId, "clientes")) throw new ForbiddenError("Só o dono (ou quem ele liberar) vê a lista de clientes.");
  const clienteId = e.request.pathValue("usuario");
  const vinculo = lib.acharVinculo(e.app, clienteId, empresaId);
  if (!vinculo || vinculo.getString("papel") !== "cliente") throw new NotFoundError("Cliente não encontrado.");
  const u = e.app.findRecordById("usuarios", clienteId);
  const veiculos = Array.from(e.app.findRecordsByFilter("veiculos", "cliente = {:c} && ativo = true", "", 20, 0, { c: clienteId }))
    .map((v) => ({
      id: v.id, placa: v.getString("placa"), final_placa: v.getString("final_placa"), modelo: v.getString("modelo"), cor: v.getString("cor"),
      porte: v.getString("porte"), app_motorista: v.getBool("app_motorista"), cobrar_como: lib.mapaTipos(vinculo)[v.id] || "",
    }));
  const h = lib.historicoCliente(e.app, empresaId, clienteId, vinculo, true);
  return e.json(200, Object.assign({ nome: u.getString("nome"), celular: u.getString("celular"), aceita_promocoes: u.getBool("aceite_marketing"), email: u.getString("contato_email"), rede_social: u.getString("rede_social"), veiculos: veiculos }, h));
}, $apis.requireAuth("usuarios"));
