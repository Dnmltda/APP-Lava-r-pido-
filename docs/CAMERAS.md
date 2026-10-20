# Câmeras — guia de instalação (Etapa 7)

Só o **patrão** vê as câmeras. Existem três jeitos de ligar, do mais simples ao mais completo.

> **Regra de ouro: nunca abra a porta do DVR/NVR para a internet** (redirecionamento de porta no roteador).
> DVR exposto é invadido em poucos dias. Todos os jeitos abaixo funcionam sem abrir porta.

## Opção A — Botão do app do fabricante (sem instalar nada)

1. No app: **Câmeras → + Nova câmera → App do fabricante**.
2. Cole o link `https://` do app ou da nuvem (ex.: Intelbras Mibo/ISIC, Hik-Connect, iVMS).
3. O botão abre o app oficial; o login continua sendo o do fabricante.

## Opção B — Ver dentro do app (gateway na loja + túnel seguro)

```
Câmeras/DVR (rede da loja) ──RTSP──> mini-PC com go2rtc ou MediaMTX ──túnel Cloudflare (https)──> servidor do app ──> celular do patrão
```

O servidor do app busca a imagem com um **token** e repassa ao celular só com um passe de 10 minutos.
O endereço do túnel e o token **nunca chegam ao celular**.

### 1. Gateway na loja (mini-PC, Raspberry Pi ou PC que fica ligado)

**go2rtc** (recomendado para "Imagem ao vivo") — `go2rtc.yaml`:

```yaml
api:
  listen: "127.0.0.1:1984"   # só local; quem expõe é o túnel
streams:
  box1: rtsp://usuario:senha@192.168.1.10:554/cam/realmonitor?channel=1&subtype=1   # Intelbras/Dahua
  box2: rtsp://usuario:senha@192.168.1.10:554/Streaming/Channels/102                # Hikvision
```

- Caminho da imagem no app: `api/frame.jpeg?src=box1`
- Use o **substream** (`subtype=1` / `...02`): imagem menor, gasta menos internet.

**MediaMTX** (para "Vídeo ao vivo", HLS) — `mediamtx.yml`:

```yaml
hlsAddress: 127.0.0.1:8888
paths:
  box1:
    source: rtsp://usuario:senha@192.168.1.10:554/cam/realmonitor?channel=1&subtype=1
```

- Caminho do vídeo no app: `box1/index.m3u8`

### 2. Token no gateway

Coloque na frente do gateway algo que exija `Authorization: Bearer <token>` (ex.: regra de acesso
do Cloudflare Access com *service token*, ou um Caddy/Nginx local). Gere um token longo e aleatório
e cadastre o mesmo valor no campo **Token do gateway** do app. Depois de salvo, ninguém vê o token de novo
(nem o patrão); para trocar, digite um novo.

### 3. Túnel seguro (Cloudflare Tunnel, gratuito)

```sh
cloudflared tunnel login
cloudflared tunnel create cameras-lavarapido
cloudflared tunnel route dns cameras-lavarapido cameras.seulavarapido.com.br
# config.yml: ingress -> service: http://127.0.0.1:1984 (go2rtc) ou http://127.0.0.1:8888 (MediaMTX)
cloudflared service install
```

No app, **Endereço do gateway**: `https://cameras.seulavarapido.com.br`.

### 4. Cadastrar no app

**Câmeras → + Nova câmera**, escolha *Imagem ao vivo* ou *Vídeo ao vivo*, preencha endereço, caminho e token.

## Sensor de movimento (alerta de área parada)

Só funciona se a câmera ou o DVR tiver **detecção de movimento** (Intelbras/Dahua, Hikvision e a maioria dos DVRs atuais têm).

1. **No DVR**: ligue a detecção de movimento nos canais que pegam a área de lavagem e desenhe a área
   (menu Eventos/Evento → Detecção de movimento / Motion). Ajuste a sensibilidade.
2. **No app**: Câmeras → Editar → *Sensor de movimento* → ligue "Avisar quando ficar sem movimento",
   escolha os minutos (padrão 10) e copie o **endereço do sensor**.
3. **No computadorzinho da loja** (o mesmo do go2rtc), com Node.js 18+:

```json
{
  "servidor": "https://endereco-do-app",
  "dvrs": [
    { "marca": "intelbras", "endereco": "http://192.168.1.10", "usuario": "admin", "senha": "…",
      "cameras": { "1": "CHAVE-DA-CAMERA-1", "2": "CHAVE-DA-CAMERA-2" } }
  ]
}
```

   - A chave é a parte final do endereço do sensor (`…/api/lr/sensor/CHAVE`). O número é o canal do DVR.
   - `marca`: `intelbras` (ou `dahua`) ou `hikvision`.
   - Rodar sempre: `node deploy/gateway/sensor-movimento.mjs config.json` (como serviço do Windows/Linux, ex.: `pm2`).
   - Use um usuário do DVR **só de leitura** para isso.
4. Pronto: cada câmera mostra "Movimento agora" / "Parado há X min" / "Sensor sem sinal".

Como funciona o alerta:
- Só no **horário de funcionamento** configurado em Configurações (sem horário configurado, não alerta).
- Área sem movimento por X minutos → alerta no celular do patrão. Um alerta por período parado.
- Sensor sem sinal por 5 minutos → alerta "sensor sem sinal"; quando volta, avisa também.
- Não identifica pessoas (sem reconhecimento facial).
- Endereço vazou? Editar → "Gerar novo" e atualize o `config.json`.

DVR que manda "notificação HTTP" por conta própria também pode chamar o endereço do sensor direto
(`POST`, corpo `{"tipo":"movimento"}`); nesse caso configure também um sinal a cada minuto (`{"tipo":"sinal"}`), senão o app mostra "sem sinal".

## Regras de segurança (já no servidor)

- Só o patrão ativo da empresa lista, cadastra, edita e vê câmeras (regras do PocketBase + rota do passe).
- Passe assinado (JWT) de 10 minutos, só para uma câmera; câmera desligada ou patrão desligado perde o acesso na hora.
- Gateway precisa ser `https://` e com endereço público; endereços internos são recusados
  (para testes locais: variável `LR_CAMERAS_LOCAL=1` no servidor).
- Respostas sem cache, sem rodar script (CSP) e sem HTML; caminhos com `..` são recusados.
- Cada visualização e alteração fica na auditoria, sem o token.
- Teste automático: `scripts/testar-cameras.mjs` (60 verificações) e `scripts/testar-sensor.mjs` (41).
