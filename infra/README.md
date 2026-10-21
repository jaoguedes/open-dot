# Implantação

**Caminho escolhido:** Cloudflare Workers Free (interface + API + cron) e Turso Free (banco separado). Nenhum outro serviço é necessário.

| Peça | Onde | Custo | Limite que importa |
|---|---|---|---|
| Interface estática | Workers Static Assets (`apps/web/dist`) | R$ 0 | — |
| API + OAuth | Worker `open-dot` (`apps/worker/src/index.ts`) | R$ 0 | 100 mil req/dia; 10 ms de CPU por requisição |
| Rotinas (08h/17h, sync, monitores) | 1 Cron Trigger `*/5 * * * *` (UTC) | R$ 0 | 5 crons por conta; 50 subrequisições por execução |
| Banco | Turso `open-dot` (separado) | R$ 0 | 5 GB; 500 mi leituras e 10 mi escritas por mês; **overages desligados** |
| IA (opcional) | Groq Free | R$ 0 | 30 RPM, 1K RPD, 8K TPM, 200K TPD por modelo |

## Passo a passo

1. Siga as seções 2 a 4 de `docs/SETUP.md`.
2. Rode `npm run setup:cloud`. Ele grava os segredos, migra o banco e pergunta antes de publicar.
3. Faça o smoke test: `curl https://open-dot.SEU-SUBDOMINIO.workers.dev/api/health` deve trazer `"ok": true` e `"schema": "0001"`.
4. Primeira revisão: entre no app, conecte o Gmail e use **Rotinas → Rodar agora**. Em até 5 minutos aparece no feed.

## Operação

- **Logs:** `npx wrangler@4 tail open-dot`. Os logs não têm conteúdo de e-mail nem tokens; o cron registra um resumo por tique.
- **Nova migração:** crie `apps/worker/migrations/0002_….sql` (somente aditiva), atualize `REQUIRED_SCHEMA` em `apps/worker/src/db/migrate.ts` e rode `npm run db:migrate -- --remote` com as variáveis do Turso no ambiente. O cron fica parado enquanto o schema estiver atrasado.
- **Rotação de chave:** rode `npm run secrets:keygen -- v2` e grave `TOKEN_KEYS="v2:…,v1:…"`. A chave nova cifra; a antiga só decifra.
- **Rollback de código:** `npx wrangler@4 rollback`. As migrações são aditivas, então o código anterior continua compatível.
- **Backup:** o PITR do Turso Free cobre 1 dia. Exportar `turso db shell open-dot .dump > backup.sql` com regularidade continua pendente de automação.

## O que não roda na nuvem

Blender (só na máquina de criação), app desktop (Tauri, fase 11) e acesso a arquivos do Mac.
