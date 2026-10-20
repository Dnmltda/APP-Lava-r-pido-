# DNM&LTDA Lava Rápido

App multiempresa para lava rápidos: fila ao vivo, reservas, vendas e equipe.
PWA em React + Vite + TypeScript + Tailwind, com backend PocketBase.

O planejamento completo está em [`docs/PLANEJAMENTO-APP-LAVA-RAPIDO.md`](docs/PLANEJAMENTO-APP-LAVA-RAPIDO.md).

## Situação

| Etapa | Status | Teste automático |
|---|---|---|
| 1. Base | ✅ concluída | `testar-isolamento.mjs`: 75/75 |
| 2. Fila (fatia principal) | ✅ concluída | `testar-fila.mjs`: 56/56 + teste com 2 celulares no navegador |
| 3 a 8 | a fazer | |

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

- **Frontend:** `npm run build` gera `web/dist/` (estático). Sobe na Hostinger. Configure o redirecionamento de SPA (todas as rotas → `index.html`).
- **Backend:** `pocketbase/Dockerfile` (Fly.io, Oracle ou VPS), com volume em `/pb/pb_data`. Defina `VITE_PB_URL` com o endereço HTTPS do backend antes do build.
- Backup diário de `pb_data`: a definir junto com o servidor (Etapa 8).

## Estrutura

```
pocketbase/pb_migrations   coleções, regras de API e configurações
pocketbase/pb_hooks        rotas /api/lr/* (cadastro, entrar, equipe) e auditoria
web/src/paginas            telas
web/src/lib/permissoes.ts  espelho da tabela de permissões (só para a interface)
scripts/                   criar empresa, testar isolamento, baixar PocketBase
```
