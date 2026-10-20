# DNM&LTDA Lava Rápido

App multiempresa para lava rápidos: fila ao vivo, reservas, vendas e equipe.
PWA em React + Vite + TypeScript + Tailwind, com backend PocketBase.

O planejamento completo está em [`docs/PLANEJAMENTO-APP-LAVA-RAPIDO.md`](docs/PLANEJAMENTO-APP-LAVA-RAPIDO.md).

## Situação

| Etapa | Status | Teste automático |
|---|---|---|
| 1. Base | ✅ concluída | `testar-isolamento.mjs`: 75/75 |
| 2. Fila (fatia principal) | ✅ concluída | `testar-fila.mjs`: 56/56 + teste com 2 celulares no navegador |
| 3. Regras da fila | ✅ concluída | `testar-regras-fila.mjs`: 49/49 (dia com 15 carros e 5 reservas) |
| 4 a 8 | a fazer | |

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
./scripts/baixar-pocketbase.sh          # baixa o PocketBase 0.40.4 para pocketbase/bin/
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

- **Tudo junto no Fly.io:** o `Dockerfile` da raiz compila o app e o coloca dentro do PocketBase (`pb_public`). App e API ficam no mesmo endereço, como no APP OBRA.
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
| `testar-e-publicar.yml` | push no `main`, PR, manual | build + testes de isolamento e fila; se passar e for `main`, publica no Fly (cria app/volume na 1ª vez) |
| `backup-diario.yml` | todo dia 03:00 (Brasília), manual | backup completo do PocketBase guardado 90 dias como artefato |
| `criar-empresa.yml` | manual | cria lava rápido + patrão (senha gerada) ou a demo |

Secrets necessários: `FLY_API_TOKEN` (org token), `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`.
Variáveis opcionais: `FLY_APP` (padrão `dnm-lava-rapido`), `FLY_ORG` (padrão `personal`), `APP_URL` (domínio próprio).
Passo a passo para configurar: [`COWORK.md`](COWORK.md).
