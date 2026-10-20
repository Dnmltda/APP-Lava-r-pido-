# Cowork: deixar o DNM&LTDA Lava Rápido 100% automático

**Produção atual: Hostinger** (hospedagem Node.js), em
`https://seagreen-cattle-355822.hostingersite.com` — o PocketBase serve o app e a API no mesmo endereço.
O Claude Code publica sozinho pela API da Hostinger (ver `deploy/hostinger/README.md`).

O que ainda depende do Cowork / do Diego (o Claude não tem acesso a essas telas):

---

## Passo 1: Backup fora do servidor + criação de empresas pelo GitHub (3 min)
O backup diário já roda **dentro** do servidor (03:00, guarda 7). Para ter uma **cópia fora** da Hostinger
(guardada 90 dias no GitHub) e o botão "Criar lava rápido" funcionando:

Em https://github.com/Dnmltda/APP-Lava-r-pido-/settings/secrets/actions:

**Aba Secrets → New repository secret**

| Nome | Valor |
|---|---|
| `PB_ADMIN_EMAIL` | `admin@dnmltda.com.br` |
| `PB_ADMIN_PASSWORD` | a senha do administrador do PocketBase (a mesma da variável `PB_ADMIN_PASSWORD` do site na Hostinger) |

**Aba Variables → New repository variable**

| Nome | Valor |
|---|---|
| `APP_URL` | `https://seagreen-cattle-355822.hostingersite.com` (ou o domínio próprio, depois do Passo 3) |

Depois: **Actions → Backup diário → Run workflow** para testar. Deve aparecer um `.zip` em *Artifacts*.

## Passo 2: Trocar a senha do administrador (recomendado antes de clientes reais)
A senha atual foi usada durante o desenvolvimento. Para trocar:
1. hPanel → Sites → `seagreen-cattle-355822.hostingersite.com` → **Node.js** → *Variáveis de ambiente* →
   mudar `PB_ADMIN_PASSWORD` (16+ caracteres) e salvar/reiniciar. O servidor aplica a senha nova sozinho ao subir.
   **Não mexa** em `PB_ADMIN_EMAIL` nem em `PB_DATA_DIR` (é onde ficam os dados; mudar faz o app abrir vazio).
   Pela API a Hostinger não mostra os valores atuais, por isso esta troca é feita no hPanel.
2. Atualizar o secret `PB_ADMIN_PASSWORD` no GitHub (Passo 1) e o cofre de senhas da DNM&LTDA.

## Passo 3: Domínio próprio (opcional, ex.: `lavarapido.dnmltda.com.br`)
1. hPanel → Sites → o site do Lava Rápido → **Domínios** → conectar/trocar o domínio (ou criar o subdomínio
   e apontar para este site). O SSL é emitido pela Hostinger.
2. Mudar a variável `APP_URL` no GitHub (Passo 1).
3. Avisar o Claude: ele confere o app no domínio novo e refaz os cartazes (o QR Code usa o endereço aberto no navegador).

## Passo 4: Permissões do Claude no GitHub (1 min, se pedir)
https://github.com/settings/installations → **Claude** → *Configure*: o `APP-Lava-r-pido-` marcado e, se aparecer,
aceitar permissões novas (Actions/Workflows).

---

## O que fica automático
| O quê | Como |
|---|---|
| Testes | cada push no `main`: todas as etapas, tabela de permissões, navegador por perfil, backup e auditoria de segurança |
| Publicar nova versão | o Claude empacota (`scripts/empacotar-hostinger.sh`) e publica pela API da Hostinger |
| Backup no servidor | todo dia 03:00 (Brasília), 7 últimos — painel `/_/` → Settings → Backups |
| Backup fora do servidor | todo dia 03:00 → `.zip` em Actions → Backup diário (90 dias) — depois do Passo 1 |
| Novo lava rápido | Actions → **Criar lava rápido** — depois do Passo 1 (ver `docs/IMPLANTACAO.md`) |
| Restaurar backup | painel `/_/` → Settings → Backups → *Restore* (ou subir o `.zip` baixado). Testado: `scripts/testar-backup.mjs` |

## Fly.io (alternativa, não usada hoje)
O `Dockerfile`/`fly.toml` continuam no projeto. Para usar Fly.io no lugar da Hostinger: criar o secret
`FLY_API_TOKEN` (Org token) — o workflow *Testar e publicar* passa a publicar lá automaticamente.
