# Cowork: deixar o DNM&LTDA Lava Rápido 100% automático

Mesmo modelo do APP OBRA: **um endereço só no Fly.io** (o PocketBase serve o app e a API, com HTTPS).
Depois destes passos, o Claude Code trabalha sozinho:
- Cada push no `main` testa tudo e, se passar, publica.
- O backup roda todo dia às 03:00.
- Empresas novas são criadas por um botão no GitHub Actions.

Ninguém precisa mandar senha para o Claude: ele usa os secrets guardados no GitHub, sem ver o valor.

---

## Passo 1: Token do Fly.io (2 min)
1. Entrar em https://fly.io/dashboard com a conta da DNM&LTDA (a mesma do APP OBRA).
2. Menu **Tokens** (ou *Account → Access Tokens*) → **Create token** → tipo **Org token** da organização `personal`, sem prazo de validade (ou 1 ano).
   - Pelo terminal: `fly tokens create org personal`
3. Copiar o token (começa com `FlyV1 ...`).

> Precisa ser **Org token** (não "deploy token"): na primeira publicação, o robô cria sozinho o app `dnm-lava-rapido` e o volume de dados em São Paulo.

## Passo 2: Secrets no GitHub (3 min)
Em https://github.com/Dnmltda/APP-Lava-r-pido-/settings/secrets/actions → **New repository secret**, criar os 3:

| Nome | Valor |
|---|---|
| `FLY_API_TOKEN` | o token do Passo 1 (inteiro, com `FlyV1`) |
| `PB_ADMIN_EMAIL` | e-mail do admin do PocketBase, ex.: `admin@dnmltda.com.br` |
| `PB_ADMIN_PASSWORD` | senha forte nova (16+ caracteres). Guardar no cofre de senhas da DNM&LTDA |

## Passo 3: Permissões do Claude no GitHub (1 min)
Em https://github.com/settings/installations → **Claude** → *Configure*:
- **Repository access**: confirmar que o `APP-Lava-r-pido-` está marcado (já está, o push funcionou).
- Se aparecer pedido de **aceitar novas permissões** (Actions / Workflows), aceitar.
  O Claude precisa disso para enviar os arquivos de `.github/workflows` e disparar o deploy, o backup e a criação de empresa.

## Passo 4: Avisar o Claude Code
Mandar na sessão: **"secrets cadastrados"**. O Claude então:
1. dispara o workflow **Testar e publicar** (primeira publicação, uns 5 min);
2. confere se `https://dnm-lava-rapido.fly.dev/api/health` está no ar;
3. roda **Criar lava rápido → demo**;
4. testa a demo online e manda o link.

> Se o nome `dnm-lava-rapido` já existir no Fly (é global), o Claude troca a variável `FLY_APP` e repete.

---

## Opcional: domínio próprio (ex.: `lavarapido.dnmltda.com.br`)
1. Na Hostinger (hPanel → Domínios → DNS do `dnmltda.com.br`): criar **CNAME** `lavarapido` → `dnm-lava-rapido.fly.dev`.
2. No Fly: `fly certs add lavarapido.dnmltda.com.br -a dnm-lava-rapido` (ou no dashboard, *Certificates*).
3. No GitHub (Settings → Secrets and variables → Actions → aba **Variables**): criar `APP_URL` = `https://lavarapido.dnmltda.com.br`.
4. Avisar o Claude.

## Custos esperados
- Fly.io: 1 máquina shared-cpu 256 MB + volume de 1 GB, por volta de US$ 2–3/mês (ou dentro da franquia, se houver).
- GitHub Actions: grátis (repositório privado tem 2.000 min/mês; cada deploy usa uns 5 min).

## O que fica automático depois
| O quê | Como |
|---|---|
| Publicar nova versão | push no `main` → testes → deploy (só publica se os testes passarem) |
| Backup | todo dia às 03:00 → `.zip` guardado 90 dias em Actions → Backup diário |
| Novo lava rápido | Actions → **Criar lava rápido** → preencher nome, link, cor, WhatsApp, patrão → a senha inicial aparece no resumo |
| Restaurar backup | baixar o `.zip` em Actions e restaurar pelo painel `https://.../_/` → Settings → Backups |
