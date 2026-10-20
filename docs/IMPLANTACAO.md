# Implantação de um lava rápido novo

Passo a passo para colocar um cliente novo no ar (≈ 1 hora + treinamento).

## 1. Pedir ao dono (lista do planejamento)
- [ ] Nome, logo e cores
- [ ] Serviços, preços e tempo médio de cada um
- [ ] Produtos vendidos, preços e estoque atual
- [ ] Horário de funcionamento
- [ ] Quantos carros lava ao mesmo tempo (padrão: 2)
- [ ] Funcionários (nome, celular, função) e quem é o gerente
- [ ] Regra de bônus por carro e comissão por produto (se houver)
- [ ] Marca e modelo do DVR/NVR + como é a internet do local (para câmeras)
- [ ] WhatsApp do lava rápido
- [ ] Termo assinado pelos funcionários sobre o monitoramento por câmeras (LGPD), se usar câmeras

## 2. Criar o lava rápido e o patrão
Pelo GitHub (depois do COWORK.md): **Actions → Criar lava rápido → Run workflow** (nome, link, cor, WhatsApp,
nome e celular do patrão). A senha inicial do patrão aparece no resumo da execução.

Ou pelo terminal:
```sh
PB_URL=https://<endereço do app> PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node scripts/criar-empresa.mjs \
  --nome "Lava Rápido do Zé" --slug lava-do-ze --cor "#0E7490" --whatsapp 5511987654321 \
  --patrao-nome "José" --patrao-celular 11987654321 --patrao-senha "senha-inicial-forte"
```
O link do lava rápido fica `https://<endereço do app>/lava-do-ze`.

## 3. Configurar (logado como patrão, junto com o dono)
1. **Configurações**: logo, cor, capacidade, tolerância de atraso, aviso antes da vez, textos, **horário de funcionamento**.
2. **Serviços**: cada serviço com preço e tempo médio (o tempo é o que faz a previsão da fila funcionar).
3. **Produtos**: preço, estoque, estoque mínimo, comissão.
4. **Equipe**: cadastrar gerente e funcionários; ligar “responsável pela fila” em quem for confirmar a fila.
5. **Configurações → metas e bônus por carro** (se houver).
6. **Câmeras** (opcional): app do fabricante ou gateway — ver `docs/CAMERAS.md`.
7. **Cartaz do balcão**: imprimir (A4) e colar no balcão, na espera e no caixa.

## 4. Treinar
Seguir `docs/TREINAMENTO.md` com cada pessoa, no celular dela. Fazer juntos um carro de teste do começo ao fim:
cliente entra na fila → confirma → inicia → baixa → avaliação. Depois cancelar/apagar o teste se precisar.

## 5. Conferir antes de entregar
- [ ] Cada pessoa da equipe entrou com o próprio login
- [ ] Um cliente de teste entrou pelo QR Code do cartaz
- [ ] Avisos (notificação) chegando no celular de teste
- [ ] Horário de funcionamento certo (os alertas de câmera e a fila dependem dele)
- [ ] Dono sabe trocar senha de funcionário e corrigir venda
- [ ] Backup do dia apareceu (Actions → Backup diário, ou painel do administrador → Backups)
