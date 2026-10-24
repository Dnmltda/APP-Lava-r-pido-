/// <reference path="../pb_data/types.d.ts" />
// Privacidade dos clientes (auditoria 24/10/2026, S1/S2): sempre que um atendimento muda (fila, pedido de
// horário, orçamento, plano), recalcula até quando a equipe sem "Lista de clientes" pode ler o cliente.
// Erro aqui nunca derruba a ação principal: só registra no log. (Funções de fora do gancho não ficam
// visíveis aqui dentro, por isso o código se repete nos dois ganchos.)

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/lib.js`).recalcularAtendimento(e.app, e.record.getString("cliente"), e.record.getString("empresa"));
  } catch (err) {
    console.log("[privacidade] falha ao recalcular atendimento", err);
  }
  e.next();
}, "fila_entradas", "agendamentos", "orcamentos", "assinaturas");

onRecordAfterUpdateSuccess((e) => {
  try {
    require(`${__hooks}/lib.js`).recalcularAtendimento(e.app, e.record.getString("cliente"), e.record.getString("empresa"));
  } catch (err) {
    console.log("[privacidade] falha ao recalcular atendimento", err);
  }
  e.next();
}, "fila_entradas", "agendamentos", "orcamentos", "assinaturas");
