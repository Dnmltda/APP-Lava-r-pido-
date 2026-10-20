# Treinamento — DNM&LTDA Lava Rápido

Um roteiro curto por perfil. Faça o treino **no celular de cada pessoa**, com o login dela
(cada um tem o seu; nada de usar o celular do outro). Leva uns 10 minutos por pessoa.

Para praticar sem mexer em dados reais, use a demonstração: `https://<endereço do app>/demo`
(senha de todos: `demo12345` — patrão 11 90000-0001, gerente …0002, responsável pela fila …0003,
funcionário …0004, cliente …0005).

---

## Para todos: instalar o app
1. Abra o link do lava rápido (ou leia o QR Code do cartaz do balcão).
2. **Android:** toque em “Instalar o app”. **iPhone:** botão Compartilhar → “Adicionar à Tela de Início”.
3. Entre com o **celular e a senha**. Esqueceu a senha? O patrão troca em *Equipe*.
4. Em *Minha conta*: mudar nome, trocar a senha, ligar/desligar promoções e sair.

---

## Funcionário
**Fila** (tela principal do dia):
- **Aguardando confirmação**: pedidos novos. Quem confirma é o patrão, o gerente ou o responsável pela fila.
- **Na fila**: carros confirmados, na ordem. Toque em **Chegou** quando o cliente chegar e em **Iniciar lavagem** ao começar.
- **Lavando** → **Pronto** → **Dar baixa**: escolha **quem lavou** e toque em **Confirmar: carro lavado**.
  É isso que conta os seus carros e o seu bônus.
- **Produtos a separar**: no cartão do carro, marque **separado** ou **em falta**.
- **Avisar no WhatsApp**: abre a conversa com a mensagem pronta (“já pode vir”).

**Vendas**: **+ Nova venda** → produtos → forma de pagamento (cartão, dinheiro, Pix na maquininha) → **Fechar venda**.
Depois de fechada, só o patrão corrige.

**Minha área**: carros lavados (hoje, semana, mês), vendas, comissão, bônus estimado, vales e holerites.

**Avaliações**: notas dos clientes. A aba **Minhas** mostra só as suas. O nome do cliente não aparece.

## Funcionário responsável pela fila
Tudo do funcionário, mais:
- **Confirmar** ou **Recusar** pedidos novos.
- **+ Balcão**: cliente que chegou sem o app → nome, final da placa, serviço → **Colocar na fila**.
- **+ Reserva**: dia e horário combinados → **Reservar**. O app encaixa na fila sozinho.
- **Vai atrasar / Reposicionar**: o cliente avisou que atrasa → escolha os minutos → **Confirmar nova posição**.
  Ninguém fura a fila: ele vai para a posição em que se encaixa.
- **Cancelar**: pede o motivo. Dá para **cancelar e substituir** por um cliente que já está no local, na mesma posição.
- **Busca do carro**: pedido com ícone de busca → **Combinar busca no WhatsApp** (local e taxa são combinados fora do app).

Tudo isso fica registrado (quem fez e quando).

## Gerente
Tudo do responsável pela fila, mais:
- **Painel do dia**: carros lavados, faturamento, formas de pagamento, metas, ranking de funcionários e produtos,
  estoque baixo e atrasos da fila (hoje, ontem, 7 dias ou mês).
- **Caixa**: **+ Gasto** / **+ Entrada** do mês.
- O gerente **não** mexe em vendas, vales, bônus ou cadastro dos outros (só o patrão).

## Patrão
Tudo do gerente, mais:
- **Equipe**: **+ Adicionar pessoa** (nome, celular, senha inicial, gerente ou funcionário), ligar
  **responsável pela fila**, desativar, **Trocar senha**. Em cada pessoa: área, **Lançar vale** (com comprovante) e holerites.
- **Vendas**: **Corrigir venda** fechada (pede o motivo; fica no histórico).
- **Serviços** e **Produtos**: preço, tempo médio, estoque, estoque mínimo e comissão.
- **Configurações**: logo, cor, quantos carros lava ao mesmo tempo, tolerância de atraso, antecedência do aviso,
  textos das notificações, horário de funcionamento, comissão ligada/desligada. Metas e bônus por carro.
- **Câmeras**: ver os boxes ao vivo; sensor de movimento com alerta de área parada (ver `docs/CAMERAS.md`).
- **Cartaz do balcão**: QR Code para imprimir. Coloque no balcão, na espera e no caixa.
- **Avaliações** com o nome do cliente.

## Cliente (o que explicar no balcão)
1. Ler o QR Code → **Criar cadastro** (nome, celular, senha, carro).
2. **Entrar na fila** → serviço → produtos (opcional) → “quero que busquem meu carro” (opcional) → **Confirmar e entrar na fila**.
3. Acompanhar a posição e a previsão. Ligar os **avisos** para receber “vez confirmada”, “já pode vir” e “carro pronto”.
4. Depois da lavagem: avaliar com estrelas.
5. Pagamento: sempre no lava rápido, na hora.

---

## Perguntas comuns
- **O cliente não recebe o aviso no iPhone.** Só funciona com o app na Tela de Início (iOS 16.4+) e avisos ligados.
- **Errei a baixa / quem lavou.** Avise o patrão: ele corrige e fica registrado.
- **O cliente sumiu.** Responsável pela fila: **Cancelar** (com motivo). A fila sobe sozinha.
- **Sem internet.** O app avisa no topo. As ações voltam a funcionar quando a internet voltar.
