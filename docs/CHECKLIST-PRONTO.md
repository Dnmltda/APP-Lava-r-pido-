# Checklist de pronto — Etapa 8 (Testes e publicação)

Conferido em 20/10/2026, no servidor de desenvolvimento **e na produção**
(`https://seagreen-cattle-355822.hostingersite.com`). Todos os testes rodam também no GitHub Actions a cada push.

## Teste completo por perfil
- [x] **Tabela de permissões 1.3 inteira**, linha por linha, com os 5 perfis (patrão, gerente, funcionário,
      responsável pela fila, cliente), pela API — `scripts/testar-permissoes.mjs`: **163/163**
- [x] **No navegador, um celular por perfil** — `scripts/testar-navegador.mjs`: **63/63** (local) e **60/60 na produção**
  - menu de cada perfil igual à tabela 1.3;
  - link direto para tela proibida volta para o início;
  - fluxo completo: cliente entra na fila → responsável confirma → funcionário inicia e dá baixa (quem lavou)
    → cliente avalia → patrão vê com nome, gerente vê sem nome;
  - todas as telas de cada perfil abrem, sem erro de JavaScript.
- [x] Testes das etapas 1–7: isolamento 75, fila 56, regras da fila 49, vendas 53, painéis 59, avisos 31,
      câmeras 60, sensor de movimento 41

## Segurança
- [x] `scripts/auditar-seguranca.mjs`: **123/123 local, 124/124 na produção** (inclui HSTS)
- [x] **Corrigido nesta etapa:** regras `cliente = @request.auth.id` deixavam visitante sem login listar entradas
      de balcão/reserva (nome, celular, placa) e os produtos delas. Agora toda regra exige login, menos
      `empresas`, `servicos` e `fila_sinais` (leitura pública de propósito, sem dados pessoais). Conferido na produção.
- [x] **Corrigido nesta etapa:** removida a coleção padrão `users` do PocketBase, que aceitava criar conta pela API.
- [x] Visitante sem login não lê nem grava nenhuma coleção com dados pessoais; rotas de administrador fechadas.
- [x] Histórico (auditoria), vendas, caixa, vales e avaliações: ninguém apaga pela API.
- [x] Limites: 10 tentativas de login a cada 5 min por IP; 5 cadastros por hora; limite geral da API.
- [x] Cabeçalhos: CSP (scripts só do próprio endereço), anti-clickjacking, nosniff, Referrer-Policy,
      Permissions-Policy, HSTS.
- [x] Câmeras: token do gateway nunca sai do servidor; passe de 10 min por câmera; só o patrão.
- [x] Senha mínima de 8 caracteres; arquivos de vale/holerite protegidos.

## Backup
- [x] Backup automático **diário 03:00 (Brasília), guarda 7** no próprio servidor.
- [x] **Restauração testada** — `scripts/testar-backup.mjs`: **8/8** com o backup **da produção**
      (servidor novo sobe com o backup, login funciona, mesma quantidade de registros nas 28 coleções, arquivos juntos).
- [ ] Cópia fora do servidor (GitHub, 90 dias): workflow pronto; falta cadastrar secrets/variável — **COWORK.md, Passo 1**.

## Publicação
- [x] No ar na Hostinger com HTTPS; demo em `/demo`.
- [x] Cartaz do balcão com QR Code (patrão → *Cartaz do balcão*), pronto para imprimir/PDF.
- [x] Política de privacidade (LGPD) por lava rápido, com link no cadastro e em *Minha conta*.
      Versão inicial: **revisar com advogado** antes de vender em escala.
- [ ] Trocar a senha do administrador antes de clientes reais — **COWORK.md, Passo 2**.
- [ ] Domínio próprio (opcional) — **COWORK.md, Passo 3**.

## Treinamento
- [x] Roteiro por perfil: `docs/TREINAMENTO.md`
- [x] Implantação de um lava rápido novo (o que pedir ao dono, criar, configurar, treinar, conferir): `docs/IMPLANTACAO.md`
- [x] Câmeras e sensor de movimento para o técnico: `docs/CAMERAS.md`

## Pendências conhecidas (não bloqueiam)
- Notificação no iPhone só com o app na Tela de Início (limitação da Apple).
- Na Hostinger a atualização "ao vivo" usa consulta a cada 10 s (o proxy deles segura o tempo real).
- Sensor de movimento: testado com DVRs Intelbras/Hikvision simulados; falta testar num DVR de verdade.
- Modelo de cobrança dos lava rápidos: em aberto (planejamento).
