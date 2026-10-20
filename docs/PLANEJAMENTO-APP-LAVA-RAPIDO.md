# DNM&LTDA Lava Rápido — Planejamento completo (Fase 1)

> Documento mestre para o Claude Code iniciar o projeto. Produto da DNM&LTDA Tecnologia.
> Versão 1.1 — 19/10/2026

**Nome do app:** DNM&LTDA Lava Rápido (padrão da casa: todo produto leva "DNM&LTDA" no nome).
Cada lava rápido cliente aparece dentro do app com o próprio logo e cores, mas a marca do produto é sempre DNM&LTDA.

---

## 0. Instruções para o Claude Code

1. Ler este documento inteiro antes de escrever qualquer código.
2. **Não inventar regra de negócio.** Se algo não estiver aqui, perguntar ao Diego.
3. Construir em fatias que funcionam de ponta a ponta (ver seção 6). Não fazer todas as telas "pela metade".
4. O app será vendido para **vários lava rápidos**. Todo dado pertence a uma empresa (`empresa_id`) e uma empresa **nunca** pode ver dados de outra.
5. Toda regra de permissão (seção 1.3) deve ser aplicada **no backend** (regras de API do PocketBase), não só escondendo botões na tela.
6. Antes de publicar: revisar segurança e testar o isolamento entre usuários e entre empresas.
7. Idioma da interface: português do Brasil. Fuso horário: America/Sao_Paulo. Moeda: R$.

---

## 1. PRODUTO

### 1.1 Visão
Um app para lava rápidos que organiza a fila de carros, as reservas, a venda de produtos e a equipe. O dono (patrão) acompanha tudo de qualquer lugar. O cliente vê a fila, entra nela pelo celular e é avisado quando chegar a vez.

**Modelo de negócio (DNM&LTDA):** um único sistema, vendido para vários lava rápidos (multiempresa). Cada lava rápido tem logo, cores e configurações próprias.

### 1.2 Problemas que resolve
- Cliente não sabe quanto tempo vai esperar e desconfia que alguém "furou a fila".
- Funcionários não sabem com antecedência que produtos separar.
- O patrão não acompanha em tempo real vendas, gastos, metas e equipe.
- Vendas de produtos sem dono definido (briga de "quem vendeu").
- Vales e adiantamentos dos funcionários controlados de cabeça ou no papel.

### 1.3 Perfis e permissões

| O que | Patrão (admin) | Gerente | Funcionário | Funcionário "Responsável pela fila" | Cliente |
|---|---|---|---|---|---|
| Ver a fila completa (nome, placa, produtos) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver a fila pública (nome + 3 últimos dígitos da placa, "Reservado") | ✅ | ✅ | ✅ | ✅ | ✅ |
| Entrar na fila pelo app | — | — | — | — | ✅ |
| Confirmar / recusar entrada na fila | ✅ | ✅ | ❌ | ✅ | ❌ |
| Cancelar, cancelar e substituir, reposicionar | ✅ | ✅ | ❌ | ✅ | ❌ (só cancela a própria) |
| Criar horários reservados | ✅ | ✅ | ❌ | ✅ | ❌ |
| Ver ordens de serviço e produtos a separar | ✅ | ✅ | ✅ | ✅ | ❌ |
| Dar baixa no carro ("carro lavado") | ✅ | ✅ | ✅ | ✅ | ❌ |
| Registrar venda de produto | ✅ | ✅ | ✅ | ✅ | ❌ |
| Corrigir venda / registro de funcionário | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver valores, vendas do dia, metas, caixa | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver ranking de vendas (por funcionário e por produto) | ✅ | ✅ | ❌ (vê só as próprias vendas) | ❌ | ❌ |
| Ver avaliações (sem nome do cliente) | ✅ (com nome) | ✅ | ✅ | ✅ | ❌ |
| Bônus, vales, holerites de todos | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver os próprios bônus, vales, carros lavados | — | ✅ | ✅ | ✅ | — |
| Câmeras | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cadastrar / remover / editar usuários, trocar senhas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar serviços, preços, produtos, comissão, bônus, textos de aviso | ✅ | ❌ | ❌ | ❌ | ❌ |
| Avaliar o serviço | — | — | — | — | ✅ (após baixa) |

Regras importantes:
- **Gerente nunca altera nada dos outros funcionários** (vendas, vales, bônus, cadastro). Só o patrão.
- **"Responsável pela fila"** é uma permissão que o patrão liga/desliga num funcionário de confiança (para quando o gerente não estiver).
- **Cada pessoa tem o próprio login.** Nada de usar o celular de outro.
- **Toda ação importante fica registrada** (quem fez e quando): confirmar, recusar, cancelar, substituir, reposicionar, dar baixa, vender, corrigir.

### 1.4 Funcionalidades por fase

**Fase 1 (esta entrega)**
- Cadastro do cliente pelo número de celular, com veículo (placa completa ou só os 3 últimos dígitos).
- Fila pública + entrada na fila pelo app, com escolha do serviço e carrinho de produtos (sem pagamento).
- Pedido de busca do carro (leva e traz).
- Ordem de serviço gerada automaticamente para a equipe.
- Confirmação, recusa, cancelamento, "cancelar e substituir", reposicionamento.
- Horários reservados encaixados na fila, com previsão automática.
- Aviso ao cliente: notificação do app + botão de WhatsApp com mensagem pronta.
- Baixa do carro registrando quem lavou.
- Venda de produtos por funcionário, com forma de pagamento, bloqueio depois de fechada e estoque baixando sozinho.
- Avaliação do cliente (funcionário, atendimento e ambiente).
- Painel do patrão: vendas, ganhos, gastos, metas, ranking, estoque baixo, atrasos da fila.
- Painel do gerente (sem bônus/vales/câmeras).
- Área do funcionário: carros lavados, vendas, bônus estimado, vales/adiantamentos com comprovante, saldo.
- Gestão da equipe pelo patrão (cadastro, permissões, bônus por carro, comissão por produto, vales, holerite).
- Câmeras: só visualização, só patrão (ver 2.6).
- Configuração por empresa: logo, cor, capacidade, tolerância, tempos de aviso, textos.

**Fase 2**
- Foto automática da câmera na baixa do carro, enviada ao patrão.
- WhatsApp automático (API oficial do WhatsApp Business).
- Fidelização: descontos, brindes, cartão fidelidade, promoções para quem lava toda semana.
- Verificação do celular por código (SMS ou WhatsApp).

**Fase 3**
- Contagem de pessoas nas áreas de trabalho pelas câmeras. O patrão informa quantos funcionários trabalham no dia; se a contagem ficar abaixo do número por mais de 10 min, ele recebe um alerta. **Sem reconhecimento facial.**

### 1.5 Fora do escopo
- **Qualquer pagamento dentro do app.** Tudo é pago na hora, no lava rápido (maquininha, dinheiro, Pix na maquininha). O app só registra a forma de pagamento.
- Combinação de local e taxa da busca do carro. Isso é feito pelo WhatsApp, fora do app.
- Reconhecimento facial.

### 1.6 Como saber se deu certo
- Clientes que abrem o app por dia (meta inicial: 10+ por dia por lava rápido).
- % de carros que entraram na fila pelo app.
- Nota média das avaliações.
- Número de faltas e atrasos.
- Vendas de produtos por semana.

---

## 2. TÉCNICO

### 2.1 Tecnologias
- **Frontend:** React + Vite + TypeScript + Tailwind CSS.
- **Backend:** PocketBase (autenticação, banco, arquivos, regras de acesso, realtime).
- **Formato:** PWA instalável (Android e iPhone), sem loja na Fase 1.
- **Tempo real:** usar as assinaturas em tempo real do PocketBase para a fila atualizar sozinha em todos os celulares.

### 2.2 Hospedagem (custo zero até a primeira venda)
- **Desenvolvimento:** tudo roda no computador do Diego (frontend + PocketBase local). Custo zero.
- **Demonstração online:** frontend estático na Hostinger (plano atual). PocketBase num servidor gratuito (Oracle Cloud Always Free) ou, se não conseguir vaga lá, na conta do Fly.io que já existe (custo pequeno).
- **Após a primeira venda:** migrar o PocketBase para uma VPS paga. A migração é simples: o PocketBase é uma pasta só (executável + `pb_data`), basta copiar e apontar o frontend para o novo endereço.
- Hospedagem compartilhada não roda o PocketBase (precisa de processo contínuo).
- Manter a configuração do endereço do backend em variável de ambiente (`VITE_PB_URL`) desde o início, para a troca de servidor ser só uma linha.
- HTTPS obrigatório (necessário para o PWA e as notificações).
- Backup diário automático do banco e dos arquivos, guardado fora do servidor.

### 2.3 Multiempresa
- Coleção `empresas` e campo `empresa_id` em **todas** as coleções de dados.
- Regras de API do PocketBase filtram sempre por empresa e por perfil.
- Um mesmo cliente pode usar mais de um lava rápido (vínculo cliente ↔ empresa).
- Cada empresa tem logo, cor principal, nome e configurações próprias.

### 2.4 Autenticação
- **Cliente:** cadastro com número de celular + senha (Fase 1). Código de verificação na Fase 2. Caixinha opcional: "Aceito receber promoções por WhatsApp/Instagram" (LGPD — guardar data do aceite).
- **Equipe:** contas criadas pelo patrão. Só o patrão troca senha de outros.
- Um cliente só pode ter **1 entrada ativa na fila por empresa** (evita fila falsa).

### 2.5 Notificações
- **Web Push** (notificação do app). No iPhone só funciona com o app instalado na tela inicial; mostrar instrução de instalação para o cliente.
- **Botão WhatsApp** (`wa.me` com mensagem pronta) para o funcionário avisar o cliente com um toque.
- Textos e antecedência do aviso (padrão: 15 min) configuráveis pelo patrão.
- Exemplo padrão: "Faltam 15 minutos para a sua vez no {nome do lava rápido}. Se quiser, já pode vir, temos café esperando!"

### 2.6 Câmeras (só patrão)
- **Depende da marca e do modelo do DVR/NVR** de cada lava rápido (Intelbras, Hikvision etc.). Levantar antes de implementar.
- **Opção A (mais simples):** integrar com a nuvem/app oficial do fabricante.
- **Opção B (dentro do app):** gateway local no lava rápido (mini PC com go2rtc ou MediaMTX) convertendo RTSP para WebRTC/HLS, acessado só através do servidor com o login do patrão.
- **Nunca** abrir porta do DVR direto para a internet. Nunca deixar o endereço do stream visível para outros perfis.
- Fase 2: o gateway tira a foto (snapshot) na hora da baixa.
- Fase 3: o gateway roda a detecção/contagem de pessoas localmente.

### 2.7 Segurança e LGPD
- Permissões aplicadas nas regras de API, testadas com cada perfil.
- Registro de auditoria que **nunca pode ser apagado**.
- Fila pública mostra só o primeiro nome + 3 últimos dígitos da placa.
- Avaliações aparecem para a equipe **sem o nome do cliente**.
- Comprovantes de vale e holerites: arquivos protegidos, visíveis só para o patrão e o próprio funcionário.
- Recomendação ao dono: termo assinado pelos funcionários informando o monitoramento por câmeras.
- Limite de tentativas de login.

---

## 3. FLUXO

### 3.1 Cliente
1. Baixa/instala o app → cadastro (nome, celular, senha, veículo).
2. Tela inicial: **fila ao vivo** + previsão de espera.
3. Toca em "Entrar na fila" → escolhe o serviço → adiciona produtos ao carrinho (opcional) → marca "Quero que busquem meu carro" (opcional) → confirma.
4. Entra na fila na hora como **Pendente** e vê sua posição e previsão.
5. Recebe "Sua vez foi confirmada".
6. Recebe aviso 15 min antes: "Já pode vir".
7. Chega → carro lavado → baixa.
8. Recebe "Como foi sua lavagem?" → avalia.

### 3.2 Estados de uma entrada na fila
```
PENDENTE → CONFIRMADO → AVISADO → NO LOCAL → LAVANDO → PRONTO → FINALIZADO
    ↘ RECUSADO          ↘ CANCELADO / SUBSTITUÍDO / REPOSICIONADO
```
- **Pendente não perde a vez.** Só sai da fila se alguém da equipe recusar ou cancelar.

### 3.3 Regras da fila (o coração do app)
1. **Ordem de entrada.** Quem entra primeiro fica na frente.
2. **Ninguém fura a fila.** Nenhuma ação coloca um cliente novo na frente de quem já está.
3. **Capacidade:** a empresa lava N carros ao mesmo tempo (padrão: 2). A previsão usa N.
4. **Tempo médio por serviço** (configurado pelo patrão) → o app calcula a previsão de início de cada carro.
5. **Horários reservados:** patrão, gerente ou responsável pela fila criam o horário (antes ou durante o expediente). O app encaixa a reserva na posição cuja previsão corresponde ao horário. O público vê só "Reservado". Os dados do cliente podem ser preenchidos depois.
6. **Fila atrasada por causa da equipe:** **mantém a sequência.** A reserva não passa na frente; o app recalcula e mostra a nova previsão. Atrasos aparecem no relatório do patrão. O cliente pode cancelar.
7. **Tolerância de atraso do cliente: 10 min** (configurável). Passou disso, o próximo que **estiver no local** sobe.
8. **Reposicionar:** o cliente atrasado não é punido. O responsável informa a nova previsão de chegada ("chego em 30 min") e o app mostra a posição em que ele se encaixa. O cliente continua na fila, em outra posição.
9. **Cancelar:** a vaga some e todos abaixo sobem uma posição (o 8º vira 7º).
10. **Cancelar e substituir:** **só no momento do cancelamento.** Coloca na mesma posição um cliente que está no local, com os dados do carro preenchidos. Depois de cancelada sem substituição, a vaga não volta.
11. Toda substituição e todo reposicionamento ficam registrados na auditoria.

### 3.4 Busca do carro (leva e traz)
1. O cliente marca a opção → entra na fila como Pendente (com ícone de busca).
2. O responsável vê o pedido → toca no botão do WhatsApp → combina local e taxa fora do app.
3. Deu certo → confirma. Não deu → recusa/cancela (a fila sobe).

### 3.5 Ordem de serviço (equipe)
- Cada entrada na fila gera uma OS: cliente, carro, serviço, produtos a separar, busca sim/não, observações.
- O funcionário marca os produtos como "separado". Se faltar no estoque, marca "procurar/em falta".
- Ao dar baixa: registra **quem lavou** e a hora (Fase 2: foto da câmera).

### 3.6 Venda de produtos
1. O funcionário registra a venda na OS do carro (ou como venda avulsa): produto, quantidade, forma de pagamento (cartão, dinheiro, Pix na maquininha).
2. A venda fica presa ao login dele, com data e hora.
3. Ao fechar, a venda é **bloqueada**. Correção só pelo patrão, com motivo, registrada na auditoria.
4. O estoque baixa automaticamente. Estoque abaixo do mínimo gera alerta para o patrão.
5. Comissão (opcional, ligada pelo patrão) por produto: valor fixo ou porcentagem.

### 3.7 Patrão
- **Painel do dia:** carros lavados, faturamento (serviços + produtos), gastos, saldo, meta do dia/mês com barra de progresso, fila agora, estoque baixo, atrasos.
- Ranking de vendas (por funcionário e por produto), avaliações, relatórios por período.
- Lançar gastos/despesas.
- Equipe: cadastrar, editar, desativar, permissões, "Responsável pela fila".
- Vales/adiantamentos: lança valor, data, anexa o comprovante do Pix. Anexa holerites.
- Bônus: valor por carro lavado e/ou comissão por produto.
- Câmeras.
- Configurações da empresa.

### 3.8 Funcionário
- Fila e OS do dia, produtos a separar, dar baixa, registrar vendas.
- **Minha área:** carros lavados (dia/semana/mês), minhas vendas, bônus estimado, vales recebidos com comprovante, saldo ("quanto já adiantei"), holerites, minhas avaliações.

---

## 4. DESIGN SYSTEM

- **White-label:** logo, nome e cor principal vêm da configuração da empresa (variáveis CSS). Uma cor de destaque fixa para status.
- **Mobile first.** A equipe usa o app em pé, com a mão molhada e no sol:
  - Botões grandes (mínimo 48 px de altura), alto contraste, texto mínimo 16 px.
  - Ações principais com 1 toque; ações que apagam ou cancelam pedem confirmação.
- **Cores de status da fila:** Pendente (amarelo), Confirmado (azul), Lavando (roxo), Pronto (verde), Cancelado/Recusado (cinza), Reservado (contorno tracejado).
- **Componentes:** card da fila, card da OS, chips de status, lista de produtos com +/–, barra de meta, cards de indicadores, tabela de ranking, estrelas de avaliação, estado vazio, carregando, erro, sem internet.
- Seguir a identidade do lava rápido (kit de marca) e evitar visual genérico de template.
- Tema claro como padrão; tema escuro opcional.

---

## 5. BANCO DE DADOS (PocketBase)

Todas as coleções de dados têm `empresa_id` (relação com `empresas`), exceto `usuarios`.

| Coleção | Campos principais | Quem acessa |
|---|---|---|
| `empresas` | nome, logo, cor_principal, whatsapp, endereco, capacidade_simultanea (2), tolerancia_min (10), aviso_min (15), textos_aviso, horario_funcionamento, ativo | patrão edita; todos da empresa leem o básico |
| `usuarios` (auth) | nome, celular (único), senha, aceite_marketing, aceite_marketing_em | o próprio; patrão vê a equipe |
| `vinculos` | usuario, empresa, papel (patrao/gerente/funcionario/cliente), responsavel_fila (bool), ativo | patrão gerencia |
| `veiculos` | cliente, placa (opcional), final_placa (3 dígitos), modelo, cor | o próprio cliente; equipe lê |
| `servicos` | empresa, nome, preco, duracao_media_min, ativo | patrão edita; todos leem |
| `produtos` | empresa, nome, foto, preco, estoque, estoque_minimo, comissao_tipo, comissao_valor, ativo | patrão edita; todos leem (cliente só os ativos) |
| `fila_entradas` | empresa, cliente, veiculo, servico, origem (app/reserva/balcao/substituicao), ordem, status, quer_busca, horario_reserva, previsao_inicio, confirmado_por, lavado_por, chegada_em, inicio_em, finalizado_em, foto_saida (F2), substituiu_entrada | equipe completa; público vê só a visão pública |
| `itens_pedido` | entrada, produto, quantidade, preco_unitario, status (pendente/separado/em_falta) | equipe; cliente vê os próprios |
| `vendas` | empresa, funcionario, entrada (opcional), forma_pagamento, total, status (aberta/fechada/corrigida), fechada_em | funcionário cria; patrão e gerente leem; só patrão corrige |
| `vendas_itens` | venda, produto, quantidade, preco_unitario, comissao_calculada | idem |
| `avaliacoes` | entrada, cliente, funcionario, nota_funcionario, nota_atendimento, nota_ambiente, comentario | cliente cria 1 por entrada finalizada; equipe lê sem o nome |
| `lancamentos_caixa` | empresa, data, tipo (entrada/saida), categoria, valor, descricao, criado_por | patrão; gerente lê |
| `metas` | empresa, periodo (dia/mês), valor | patrão; gerente lê |
| `regras_bonus` | empresa, valor_por_carro, ativo | só patrão |
| `vales` | empresa, funcionario, valor, data, comprovante (arquivo), observacao, lancado_por | patrão; o próprio funcionário lê os seus |
| `holerites` | empresa, funcionario, competencia, arquivo | patrão; o próprio lê |
| `cameras` | empresa, nome, tipo_integracao, endereco_stream (protegido) | **só patrão** |
| `escala_dia` (F3) | empresa, data, qtd_funcionarios | só patrão |
| `push_inscricoes` | usuario, dados da inscrição | o próprio |
| `auditoria` | empresa, usuario, acao, entidade, entidade_id, antes, depois, motivo, criado_em | só patrão lê; **ninguém edita ou apaga** |

**Visão pública da fila:** endpoint ou visão que devolve só primeiro nome, 3 últimos dígitos da placa, posição, status e previsão, com "Reservado" no lugar dos dados das reservas.

**Índices:** `fila_entradas (empresa, status, ordem)`, `vendas (empresa, fechada_em)`, `vinculos (usuario, empresa)`.

---

## 6. PLANO DE EXECUÇÃO

Ritmo considerado: 8–10 h/dia com o Claude Code.

| Etapa | Entregável | Teste da etapa | Tempo |
|---|---|---|---|
| 1. Base | Projeto criado, PocketBase, empresas, usuários, vínculos, login por perfil, white-label | Cada perfil loga e vê só o seu; empresa A não vê a B | 3–4 dias |
| 2. Fila (fatia principal) | Cadastro do cliente + veículo, fila pública ao vivo, entrar na fila, confirmar/recusar, estados, baixa | 2 celulares: cliente entra, equipe confirma, fila atualiza sozinha | 4–5 dias |
| 3. Regras da fila | Reservas, previsão com 2 carros, tolerância, reposicionar, cancelar, cancelar e substituir, busca do carro, auditoria | Simular um dia com 15 carros e 5 reservas | 3–4 dias |
| 4. Produtos e vendas | Carrinho, OS com produtos a separar, venda por funcionário, bloqueio, estoque, comissão | Funcionário não edita venda fechada; estoque confere | 3 dias |
| 5. Painéis | Patrão (dia, metas, caixa, ranking, estoque), gerente, área do funcionário (bônus, vales, holerites) | Gerente não vê bônus/vales; funcionário vê só os seus | 4–5 dias |
| 6. Avisos e avaliação | Web push, botão WhatsApp, textos configuráveis, avaliação pós-baixa | Notificação chega no Android e no iPhone instalado | 2–3 dias |
| 7. Câmeras (visualização) | Integração conforme o DVR do cliente, só patrão | Outros perfis não acessam nem por link direto | 2–7 dias |
| 8. Testes e publicação | Teste completo por perfil, segurança, backup, publicação, treinamento | Checklist de pronto | 4–5 dias |

**Total: 5 a 6 semanas.**
**Versão de demonstração para vender** (etapas 1 e 2 + painel básico): ~1,5 a 2 semanas.

### Riscos
- **Câmeras:** dependem do modelo do DVR e da rede do lava rápido. Não prometer prazo antes de saber o modelo.
- **Notificação no iPhone:** só com o app instalado na tela inicial.
- **Servidor:** o PocketBase precisa de VPS. Definir antes da etapa 1.
- **Adesão dos clientes:** o dono precisa divulgar o app no balcão (QR code, cartaz).

### O que pedir ao dono do lava rápido
- [ ] Nome, logo e cores
- [ ] Serviços, preços e tempo médio de cada um
- [ ] Produtos vendidos, preços e estoque atual
- [ ] Horário de funcionamento
- [ ] Quantos carros lava ao mesmo tempo (confirmar 2)
- [ ] Funcionários (nome, celular, função) e quem é o gerente
- [ ] Regra de bônus por carro e comissão por produto (se houver)
- [ ] Marca e modelo do DVR/NVR + como é a internet do local
- [ ] WhatsApp do lava rápido

### Decisões tomadas
- Nome: DNM&LTDA Lava Rápido.
- Hospedagem: grátis durante desenvolvimento e demonstração; VPS paga só depois da primeira venda.

### Pergunta em aberto (para o Diego)
- Modelo de cobrança para os lava rápidos (a definir na proposta comercial).

---

## Primeiro comando sugerido para o Claude Code

> Leia o arquivo PLANEJAMENTO-APP-LAVA-RAPIDO.md inteiro. Antes de programar, me faça as perguntas que faltarem. Depois comece pela Etapa 1 (Base) e só passe para a próxima etapa quando os testes da etapa atual estiverem funcionando.
