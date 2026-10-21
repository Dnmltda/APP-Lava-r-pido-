# DNM&LTDA Lava Rápido

App multiempresa para lava rápidos: fila ao vivo, reservas, vendas e equipe.
PWA em React + Vite + TypeScript + Tailwind, com backend PocketBase.

O planejamento completo está em [`docs/PLANEJAMENTO-APP-LAVA-RAPIDO.md`](docs/PLANEJAMENTO-APP-LAVA-RAPIDO.md).

Ideias aprovadas para depois (foto automática da câmera, contagem de pessoas, código no celular, WhatsApp
automático): [`docs/IDEIAS-FUTURAS.md`](docs/IDEIAS-FUTURAS.md).

## No ar (empresa de teste, começa vazia)

**https://seagreen-cattle-355822.hostingersite.com/claude-teste**: hospedagem Node.js da Hostinger (ver [`deploy/hostinger/README.md`](deploy/hostinger/README.md)).

## Situação

| Etapa | Status | Teste automático |
|---|---|---|
| 1. Base | ✅ concluída | `testar-isolamento.mjs`: 75/75 |
| 2. Fila (fatia principal) | ✅ concluída | `testar-fila.mjs`: 56/56 + teste com 2 celulares no navegador |
| 3. Regras da fila | ✅ concluída | `testar-regras-fila.mjs`: 49/49 (dia com 15 carros e 5 reservas) |
| 4. Produtos e vendas | ✅ concluída | `testar-vendas.mjs`: 53/53 |
| 5. Painéis | ✅ concluída | `testar-paineis.mjs`: 59/59 |
| 6. Avisos e avaliação | ✅ concluída | `testar-avisos.mjs`: 31/31 (Web Push descriptografado + VAPID conferido) |
| 7. Câmeras | ✅ concluída | `testar-cameras.mjs`: 60/60 (gateway falso com token, passes forjados/vencidos) |
| 7b. Sensor de movimento | ✅ concluída | `testar-sensor.mjs`: 41/41 (DVRs Intelbras e Hikvision falsos com login Digest + gateway) |
| 8. Testes e publicação final | ✅ concluída | `testar-permissoes.mjs` 163/163 · `testar-navegador.mjs` 63/63 · `testar-backup.mjs` 8/8 · `auditar-seguranca.mjs` 124/124 (produção) |

### Melhorias pedidas pelo Diego (depois da Etapa 8)
Teste: `scripts/testar-novidades.mjs` (39) + `testar-navegador.mjs` (68).
- **Login lembrado**: o app fica conectado por 60 dias (renova sozinho a cada uso), lembra o último celular
  e oferece salvar a senha no gerenciador do celular; botão "Mostrar" senha.
- **Dashboard** (patrão e gerente, `/:slug/dashboard`): filtro de período (hoje, 7 e 30 dias, mês, mês passado,
  datas), faturamento com comparação ao período anterior, carros, ticket médio, tempo de espera e de lavagem,
  gráficos por dia, horário de movimento, dia da semana, serviços, produtos, formas de pagamento, equipe,
  fila, clientes, avaliações e caixa. Todo gráfico tem "Ver tabela". **Baixar planilha (CSV)** e **Imprimir/PDF**.
- **Início modernizado**: a fila ao vivo em destaque para toda a equipe (a confirmar, na fila, lavando, prontos
  e o próximo carro), resumo de hoje para patrão/gerente e atalhos em grade com ícones.
- **Vitrine de produtos para o cliente**: vê os produtos com foto e preço e **reserva antes ou durante a fila**
  (enquanto o carro espera ou está sendo lavado). Pode tirar o que a equipe ainda não separou.
- Corrigido: o tempo real estava desligado por um ajuste antigo; agora a fila atualiza na hora
  (a consulta a cada 10 s continua como rede de segurança).
- `scripts/popular-demo.mjs`: 30 dias de movimento fictício só na empresa **demo** (para ver o dashboard).
- **Cadastro**: senha fácil é recusada (todos iguais, sequência, o próprio celular, "senha123"…) no cadastro,
  na equipe e em Minha conta; botão "Mostrar" senha; nome limpo; até 20 cadastros por hora por internet.
- **Meu histórico (cliente)**: quantas vezes veio, desde quando é cliente, serviços feitos (com quantas vezes)
  e produtos comprados em cada visita. **Sem valores**, por decisão do Diego (`/api/lr/meu-historico/{slug}`).
- **Clientes (dono)**: lista com visitas, última visita, cliente desde, celular e gasto; histórico de cada um com
  valores, veículos e WhatsApp. Busca por nome/celular e ordem por recentes, visitas ou gasto.
- **Acessos liberados pelo dono** (Equipe → pessoa → "Acessos liberados por você"), por pessoa e na hora:
  lista de clientes, valores e dashboard (o gerente já tem), ver câmeras (configurar continua do dono) e
  serviços/preços/produtos. Equipe e senhas, vales, holerites, configurações e auditoria continuam só do dono.
  Promover funcionário a gerente continua na mesma tela. Teste: `scripts/testar-acessos.mjs` (48).
- `scripts/limpar-producao.mjs`: deixa a produção pronta para testes com pessoas (apaga `teste-*`, o movimento
  da demo e as contas, menos as mantidas). Sem `--executar` só mostra o que faria.

### Etapa 8: Testes e publicação
Checklist completo com as evidências: [`docs/CHECKLIST-PRONTO.md`](docs/CHECKLIST-PRONTO.md).
- **Tabela de permissões 1.3 inteira** testada pela API com os 5 perfis (163 verificações).
- **Teste no navegador com um celular por perfil**: menu de cada um, telas proibidas, fluxo completo
  (fila → confirmar → lavar → baixa → avaliação) e todas as telas sem erro. Roda também contra a produção.
- **Segurança** (`scripts/auditar-seguranca.mjs`, roda local ou na produção). Corrigidos nesta etapa:
  - regras que deixavam visitante sem login ler entradas de balcão/reserva (nome, celular, placa);
  - coleção padrão `users` do PocketBase, aberta para criar conta pela API;
  - cabeçalhos CSP, HSTS, Referrer-Policy e Permissions-Policy.
- **Backup** automático diário (03:00, guarda 7) e **restauração testada** com o backup da produção.
- **Cartaz do balcão** com QR Code (patrão) e **política de privacidade** (LGPD) por lava rápido.
- **Treinamento** por perfil ([`docs/TREINAMENTO.md`](docs/TREINAMENTO.md)) e **implantação** de um lava rápido novo
  ([`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md)).

### Etapa 7: Câmeras (só o patrão)
- Tela **Câmeras** no painel do patrão. Gerente, funcionário e cliente não veem nem pela API (regra no PocketBase).
- Três jeitos de ligar (guia completo em [`docs/CAMERAS.md`](docs/CAMERAS.md)):
  - **App do fabricante**: botão que abre o app/nuvem oficial (Intelbras, Hikvision…). Não precisa de nada na loja.
  - **Imagem ao vivo**: foto a cada segundo, vinda de um gateway na loja (go2rtc) por túnel seguro (Cloudflare).
  - **Vídeo ao vivo (HLS)**: vídeo do gateway (MediaMTX/go2rtc), mesmo esquema.
  - **Demonstração**: imagem gerada pelo servidor, para testar sem câmera (já cadastrada na empresa demo).
- **O celular nunca recebe o endereço nem o token do gateway**: o patrão pede um passe de 10 minutos, só daquela câmera, e a imagem passa pelo servidor. Câmera desligada ou patrão desligado perde o acesso na hora, mesmo com passe.
- Em produção o gateway precisa ser `https://` e público (túnel); endereços internos (192.168.x, localhost…) são recusados. **Nunca abrir a porta do DVR.**
- Cada visualização e cada mudança de câmera fica na auditoria (sem o token).
- **Sensor de movimento** (pedido do Diego: só funciona se a câmera/DVR tiver detecção de movimento):
  - O programa `deploy/gateway/sensor-movimento.mjs`, no computadorzinho da loja, escuta os eventos de movimento do DVR (Intelbras/Dahua e Hikvision, login Digest) e avisa o app. A cada minuto manda um "sinal" de que está ligado.
  - Cada câmera mostra **"Movimento agora"**, **"Parado há X min"** ou **"Sensor sem sinal"**, e o histórico do dia.
  - **Alerta no celular do patrão** quando a área fica X minutos sem movimento (padrão 10, configurável por câmera), **só no horário de funcionamento**. Também avisa se o sensor parar de responder (5 min) e quando volta.
  - O alerta não se repete: um por período parado. Ao ligar o sensor, conta a partir dali (não alerta pelo passado).
  - Sem reconhecimento facial (fora do escopo do planejamento): o alerta diz que a área ficou parada, não quem saiu.
  - Na câmera de demonstração o sensor é simulado (botão "Simular movimento agora" no histórico).

### Etapa 6: Avisos e avaliação
- **Notificação no celular (Web Push)**: "Vez confirmada", "Já pode vir" e "Carro pronto". Depois da baixa vem o convite "Como foi sua lavagem?", que abre a tela de avaliar.
  - O "Já pode vir" sai **sozinho** quando faltam X minutos (padrão 15), verificado a cada minuto, sem repetir. O botão "Avisar no WhatsApp" também manda pelo app.
  - O envio é feito em Go, no PocketBase do Lava Rápido (`deploy/hostinger/pocketbase/push.go`, biblioteca webpush-go). As chaves VAPID são geradas sozinhas e ficam no servidor.
  - Aparelho que desinstalou (410) é removido sozinho. Ao sair do app, o aparelho deixa de receber.
  - **iPhone**: só com o app na Tela de Início (iOS 16.4+). O app mostra o passo a passo. **Android**: botão "Instalar o app".
- **Textos configuráveis** (Configurações), com prévia: confirmação, "já pode vir", pronto e convite para avaliar. Aceitam `{empresa}`, `{minutos}` e `{hora}`.
- **Avaliação** (1 a 5 estrelas): quem lavou, atendimento e ambiente, mais comentário. Uma por lavagem, só pelo cliente, depois da baixa, em até 30 dias.
  - A **equipe vê as médias e a lista sem o nome do cliente**. O patrão vê com o nome. Cada funcionário tem a aba "Minhas".

### Etapa 5: Painéis
- **Painel do dia** (patrão e gerente), por hoje, ontem, 7 dias ou mês:
  - faturamento (serviços + produtos), carros lavados, gastos, outras entradas e saldo;
  - metas do dia e do mês com barra de progresso (só o patrão define);
  - fila agora, com pendentes e clientes atrasados;
  - **estoque baixo**;
  - ranking de vendas por funcionário (com carros lavados) e por produto;
  - formas de pagamento, gastos por categoria e **atrasos da fila** (carros que começaram depois da previsão confirmada).
- **Caixa**: o patrão lança gastos e entradas avulsas. Lançamento se cancela, não se apaga. O gerente só consulta.
- **Bônus por carro lavado** (regra que só o patrão vê) mais a **comissão por produto** (Etapa 4).
- **Vales e adiantamentos** com **comprovante do Pix**, e **holerites** por mês. São arquivos **protegidos**: só o patrão e a própria pessoa abrem, e nem o gerente abre os dos outros.
- **Minha área** (gerente e funcionário): carros lavados (hoje, semana, mês), vendas, bônus estimado, vales, saldo estimado (bônus − vales) e holerites. O patrão vê a de cada pessoa em Equipe → Financeiro.
- Tudo na auditoria.

### Etapa 4: Produtos e vendas
- **Produtos** (o patrão cadastra): foto, preço, estoque, mínimo para alerta, comissão por produto (nenhuma, R$ por unidade ou % do valor). A comissão só vale com a chave "Comissão por produto" ligada. Mudanças de preço, estoque e comissão vão para a auditoria.
- **Carrinho do cliente** ao entrar na fila (sem pagamento). O cliente vê só nome, preço e disponibilidade, pela rota `/api/lr/catalogo`. Estoque e comissão nunca chegam ao app do cliente.
- **Ordem de serviço**: o cartão do carro mostra "Produtos a separar" com os botões **Separar** e **Em falta**. O cliente vê "separado ✓" ao vivo.
- **Venda por funcionário** (na OS do carro ou avulsa): a venda fica presa ao login de quem vendeu, com data e hora, e registra cartão, dinheiro ou Pix na maquininha. Na OS ela já vem preenchida com o que o cliente pediu, menos o que está em falta.
- **Bloqueio**: enquanto aberta, só quem registrou edita ou descarta. Depois de **fechada**, ninguém altera. Só o **patrão corrige**, com motivo obrigatório, e o estoque é refeito pela diferença. A auditoria guarda antes e depois.
- **Estoque baixa sozinho** ao fechar. O alerta de estoque baixo aparece na tela de Produtos e irá para o painel do patrão (Etapa 5).
- Funcionário vê só as próprias vendas. Patrão e gerente veem todas. Cliente não vê nenhuma.

### Etapa 3: Regras da fila (seção 3.3 do planejamento)
- **Horários reservados**: patrão, gerente ou responsável pela fila criam a reserva (com dia e horário). O app encaixa a reserva antes do primeiro carro cuja previsão já passa do horário, e ela nunca começa antes do horário. O público vê só "Reservado". Os dados do cliente podem ser preenchidos depois. Se o celular for de um cliente cadastrado, a reserva aparece no app dele.
- **Ninguém fura a fila**: o cliente novo entra no fim. A única exceção são reservas marcadas para mais tarde no fim da fila: o cliente novo passa na frente delas **só se isso não atrasar a reserva**. Testado a cada uma das 15 chegadas.
- **Fila atrasada pela equipe**: a sequência não muda e a reserva não passa na frente. O app recalcula e mostra a nova previsão.
- **Tolerância** (padrão 10 min, configurável): conta a partir do aviso pelo WhatsApp (mais a antecedência do aviso), do horário da reserva ou da previsão confirmada. Passou disso, o cartão fica "Atrasado X min" e o próximo **que está no local** pode começar sem alerta. O atrasado continua na vez dele.
- **Reposicionar**: o responsável informa "chega em X min". O app mostra de que posição para qual o cliente vai e a nova previsão, e só então aplica. Nunca leva ninguém para a frente.
- **Cancelar**: a vaga some e todos sobem.
- **Cancelar e substituir**: só no momento do cancelamento, um cliente que está no local entra na **mesma posição**. Depois de cancelada, a vaga não volta.
- Tudo registrado na auditoria (posição antes e depois, motivo, quem fez).

### Etapa 2: Fila
- Cadastro do cliente com veículo: placa completa ou só os 3 últimos caracteres. Tela "Meus veículos".
- Serviços com preço e tempo médio, cadastrados pelo patrão.
- **Fila ao vivo**: atualiza sozinha em todos os celulares, sem dados pessoais. Um "sinal" público por empresa avisa que a fila mudou e cada celular busca de novo a visão pública.
- Visão pública: primeiro nome, 3 últimos da placa, posição, status e previsão. Reservas aparecem como "Reservado".
- Previsão: usa a capacidade da empresa (N carros ao mesmo tempo) e o tempo de cada serviço. A ordem de entrada é mantida.
- Cliente: entra na fila (serviço, veículo, pedido de busca, observação), vê a própria posição e a previsão e pode cancelar. Só 1 entrada ativa por empresa.
- Equipe: confirmar e recusar (patrão, gerente ou responsável pela fila), avisar pelo WhatsApp com a mensagem pronta, marcar "chegou", iniciar a lavagem, marcar "pronto" e dar baixa registrando quem lavou.
- Iniciar a lavagem de um carro que tem outros na frente pede confirmação e fica registrado na auditoria.
- Cliente de balcão (sem app) entra confirmado, no fim da fila.
- Todas as mudanças da fila passam pelas rotas `/api/lr/fila/*`: ninguém altera a fila direto pela API. Cada ação fica na auditoria.

### Etapa 1: Base

- Coleções `empresas`, `usuarios` (login por celular + senha), `vinculos` (usuário ↔ empresa + papel) e `auditoria`.
- Regras de API filtram tudo por empresa e por papel. A empresa A nunca vê a B.
- O cliente entra pelo **link/QR do lava rápido** (`/<slug>`): cadastro, login e criação do vínculo como cliente.
- Painel por perfil: patrão, gerente, funcionário (com "responsável pela fila") e cliente.
- Patrão: cadastra a equipe, muda função, liga ou desliga o "responsável pela fila", desativa acessos e troca senhas.
- Patrão: configura logo, cor (white-label ao vivo), WhatsApp, endereço, capacidade, tolerância, aviso e horários.
- Auditoria imutável das ações de equipe e de configuração.
- Limite de tentativas de login e de cadastro.
- PWA instalável.

### Decisões tomadas com o Diego (20/10/2026)
- Repositório próprio, separado do APP OBRA.
- O cliente escolhe o lava rápido pelo **link/QR por empresa** (`app/<slug>`).
- **Empresa nova e o primeiro patrão** são criados pela DNM&LTDA com o admin do PocketBase (`scripts/criar-empresa.mjs`).
- Demonstração com empresa fictícia **Lava Rápido Demo** (`/demo`).

### Regras de segurança da base (decididas na implementação)
- O patrão não promove ninguém a patrão e não altera o próprio vínculo nem o de outro patrão.
- O slug (endereço) e o campo `ativo` da empresa só a DNM&LTDA muda.
- O patrão só troca a senha de gerente ou funcionário cuja conta **não** seja usada em outro lava rápido. Se a pessoa já tiver conta no app, cadastrá-la na equipe só vincula: nome e senha dela não mudam.
- Remover alguém da equipe = desativar. O histórico fica guardado.
- A auditoria não pode ser editada nem apagada, nem pelo superusuário. A única exceção é a das empresas de teste (`teste-*`).

## Rodar no computador

Requisitos: Node 20+.

```sh
./scripts/compilar-pocketbase.sh        # compila o PocketBase do Lava Rápido (precisa de Go) em pocketbase/bin/
npm run pb                              # backend em http://127.0.0.1:8090 (aplica as migrations)
./pocketbase/bin/pocketbase superuser upsert voce@email.com 'SenhaForte123' --dir pocketbase/pb_data

cd web && cp .env.example .env.local && npm install && cd ..
npm run web                             # app em http://127.0.0.1:5173

PB_ADMIN_EMAIL=voce@email.com PB_ADMIN_PASSWORD='SenhaForte123' npm run demo
```

Depois abra `http://127.0.0.1:5173/demo`. A senha de todos os usuários demo é `demo12345`:

| Perfil | Celular |
|---|---|
| Patrão | 11 90000-0001 |
| Gerente | 11 90000-0002 |
| Funcionário responsável pela fila | 11 90000-0003 |
| Funcionário | 11 90000-0004 |
| Cliente | 11 90000-0005 |

### Criar um lava rápido de verdade

```sh
PB_URL=https://seu-backend PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/criar-empresa.mjs \
  --nome "Lava Rápido do Zé" --slug lava-do-ze --cor "#0E7490" --whatsapp 5511987654321 \
  --patrao-nome "José" --patrao-celular 11987654321 --patrao-senha "senha-forte"
```

O link do QR Code fica `https://<endereço do app>/lava-do-ze`.

## Teste da etapa (isolamento)

Rode com o PocketBase de **desenvolvimento** ligado. O script cria as empresas `teste-*`, testa cada perfil e apaga tudo no final:

```sh
PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... npm run testar
```

São 75 verificações: visitante, cadastro, cliente, funcionário, gerente, responsável pela fila, funcionário desativado, patrão A × empresa B e auditoria.
O limite de 5 cadastros por hora vale também para o teste. Se rodar várias vezes seguidas, reinicie o PocketBase para zerar o limite.

## Publicação

- **Produção atual: Hostinger** (Node.js) — ver [`deploy/hostinger/README.md`](deploy/hostinger/README.md) e [`COWORK.md`](COWORK.md).
- **Alternativa no Fly.io:** o `Dockerfile` da raiz compila o app e o coloca dentro do PocketBase (`pb_public`). App e API ficam no mesmo endereço, como no APP OBRA.
- Para separar o frontend (ex.: Hostinger estática), faça o build com `VITE_PB_URL=https://backend` e configure o redirecionamento de SPA.
- Backup diário automático (ver Automação).

## Estrutura

```
pocketbase/pb_migrations   coleções, regras de API e configurações
pocketbase/pb_hooks        rotas /api/lr/* (cadastro, entrar, equipe) e auditoria
web/src/paginas            telas
web/src/lib/permissoes.ts  espelho da tabela de permissões (só para a interface)
scripts/                   criar empresa, testar isolamento, baixar PocketBase
```

## Automação (GitHub Actions + Fly.io)

| Workflow | Quando | O que faz |
|---|---|---|
| `testar-e-publicar.yml` | push no `main`, PR, manual | build + testes de todas as etapas (isolamento, fila, regras, vendas, painéis, avisos, câmeras); se passar e for `main`, publica no Fly (cria app/volume na 1ª vez) |
| `backup-diario.yml` | todo dia 03:00 (Brasília), manual | backup completo do PocketBase guardado 90 dias como artefato |
| `criar-empresa.yml` | manual | cria lava rápido + patrão (senha gerada) ou a demo |

Secrets necessários: `FLY_API_TOKEN` (org token), `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`.
Variáveis opcionais: `FLY_APP` (padrão `dnm-lava-rapido`), `FLY_ORG` (padrão `personal`), `APP_URL` (domínio próprio).
Passo a passo para configurar: [`COWORK.md`](COWORK.md).
