# Ideias guardadas (para depois)

Ideias aprovadas pelo Diego em 20/10/2026, mas deixadas para quando o app tiver clientes pagando.
Cada uma diz o que precisa, quanto custa e o tamanho do trabalho (P = dias, M = semanas, G = meses).

## 1. Foto automática da câmera na baixa do carro — M
- **O que faz:** quando a equipe dá baixa ("carro lavado"), o app tira uma foto da câmera do box e guarda junto
  com a lavagem. O dono vê no histórico e o cliente pode ver a foto do carro pronto.
- **Precisa:** câmeras/DVR que entreguem imagem parada (snapshot) por endereço local, e o "gateway" que já existe
  (`deploy/gateway/`) rodando num computador ou Raspberry no lava rápido. Ver `docs/CAMERAS.md`.
- **Custo:** sem mensalidade. Espaço no servidor (cada foto ~150 KB comprimida).
- **Já existe e ajuda:** câmeras cadastradas por box, sensor de movimento, fotos antes/depois (vistoria) e a rota
  de arquivo protegido.

## 2. Contagem de pessoas nas áreas de trabalho (câmeras) — G
- **O que faz:** o dono informa quantos funcionários trabalham no dia; se a câmera contar menos gente na área por
  mais de 10 minutos, chega um alerta. **Sem reconhecimento facial** (só conta pessoas).
- **Precisa:** item 1 funcionando + um modelo de detecção de pessoas rodando no gateway local (ex.: computador com
  placa de vídeo simples ou Raspberry com acelerador). Testar com as câmeras reais antes de prometer.
- **Custo:** equipamento no local (a partir de um mini PC); sem mensalidade.
- **Cuidados (LGPD):** aviso visível no local e termo assinado pelos funcionários (já está no checklist de implantação).

## 3. Código de confirmação do celular no cadastro — P
- **O que faz:** ao se cadastrar, o cliente recebe um código por SMS ou WhatsApp e digita no app. Evita cadastro
  com número falso ou de outra pessoa.
- **Precisa:** um provedor de SMS ou a API oficial do WhatsApp Business (conta Meta verificada).
- **Custo:** por mensagem enviada (SMS no Brasil costuma custar centavos por envio; WhatsApp cobra por conversa).
  Ver preço atual do provedor antes de ligar.

## 4. WhatsApp automático — M
- **O que faz:** as mensagens "vez confirmada", "já pode vir", "carro pronto" e "reativar cliente" saem sozinhas,
  sem a equipe tocar no botão. Hoje elas já existem como **botões com mensagem pronta** (sem custo).
- **Precisa:** API oficial do WhatsApp Business (conta Meta verificada, número só para isso, modelos de mensagem
  aprovados pela Meta).
- **Custo:** por conversa iniciada pela empresa (tabela da Meta). As notificações do próprio app (push) continuam
  grátis.

## 5. Outras ideias que apareceram no caminho
- **Picapes pequenas e limite de carros:** resolvidos em 23/10/2026. Não há mais limite de carros por cliente,
  e cada dono ajusta o tamanho de qualquer modelo na tela **Tamanho dos carros** (ex.: Strada como médio).
- **Preço de moto:** a tabela de referência não tem (sem fonte confiável); cada lava rápido cadastra o seu.

## 6. Para a versão de venda (decidido pelo Diego em 21/10/2026)
Entram só depois que o site da DNM&LTDA tiver a área de login e senha dos membros (exclusividades e descontos
futuros com parceiros como Woltrix e Navarro). Até lá o app fica exatamente como está.
- **Liga/desliga de módulos por empresa** (ex.: câmeras desligadas por padrão).
- **Conta de demonstração** separada para quem quer conhecer o app.
- **Aviso "Protótipo em teste — DNM&LTDA"** e **botão "Deixar opinião"**.
- **Aceite dos termos e da privacidade (LGPD)** no cadastro.
- **Poder do titular:** hoje o titular (dnmltda@hotmail.com) administra tudo, inclusive logins de todas as
  empresas. Na venda, tirar do titular o poder de mexer nos logins e dados das empresas clientes.
