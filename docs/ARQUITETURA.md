# Arquitetura do Open Dot (uma página)

## Peças

```
navegador (PWA, React)  ──HTTPS──▶  Cloudflare Worker (Workers Free)  ──HTTP/Hrana──▶  Turso (SQLite)
   apps/web                          apps/worker/src/index.ts                         schema 0001–0007
                                       ├─ /api/*   → app.ts (rotas) → repo.ts (SQL) → db/hrana.ts
                                       ├─ estáticos → ASSETS (apps/web/dist, _headers)
                                       └─ cron */5  → jobs.ts (tique)
                                                       └─ Gmail, GitHub, Vercel, RSS, cotações (só leitura)
```

Um único Worker serve a interface, a API e o cron (D-001). O banco é a autoridade: cada execução tem chave única por horário, lease e compare-and-set de versão (D-002). Não há fila nem servidor sempre ligado.

## Requisição

1. `index.ts` recebe; `/api/version` responde sem banco; `/api/*` monta o contexto (`buildCtx`: env validado por zod, chaves de cifra, `HranaDb`).
2. `app.ts` acha a rota, decodifica parâmetros (400 se malformados), confere CSRF em toda mutação (`x-open-dot: 1` + `Origin`), lê a sessão (cookie `__Host-od_session` → hash → `od_sessions`) e exige dono quando a rota é autenticada.
3. O handler chama `repo.ts`. **Toda consulta filtra por `owner_id`.** Dados privados (corpo do resumo, e-mails, propostas de aprovação, tokens) ficam cifrados com AES-GCM e AAD por dono.
4. Erro vira JSON: 400 (`invalid_input`), 401, 403 (`csrf`), 404, 409, 500 com `reason` seguro (`safeReason`). Logs passam por `logSafe` (sem token, e-mail ou Authorization).
5. A interface busca tudo com `GET /api/snapshot` (uma requisição, ETag/304) a cada 60 s com a aba visível.

## Cron (a cada 5 minutos)

`jobs.ts` → confere o schema (aceita igual ou mais novo) → orçamento de 44 subrequisições → passos independentes (cada um com try/catch próprio): 1 planejar horários vencidos, 2 sincronizar Gmail, 3 executar revisões (Correio, Notícias, arquivos), 4 monitores HTTP, 5 Vercel/encomendas/cotações, 6 retenção. Ao fim grava a rodada em `od_system_state` para o Diagnóstico.

## Limites do Workers Free que moldam o código

| Limite | Efeito no código |
|---|---|
| 50 subrequisições por invocação (cada `db.query` no Turso é uma) | `SubrequestBudget` conta banco + HTTP e para em 44; gravações em lote (`db.batch`); no máximo 3 novas tentativas de leitura por instância; snapshot ≈ 20 consultas. |
| 10 ms de CPU por invocação | Sem parse pesado no Worker: corpo de e-mail não é baixado (só metadados + trecho); feeds limitados a 1 MB e 15 itens; IA só via HTTP (Groq), nunca no Worker. |
| 100 mil requisições por dia | Polling de 60 s só com a aba visível e 304 quando nada mudou; estáticos com cache longo. |
| 5 Cron Triggers por conta | Um só (`*/5 * * * *`); o código converte os horários do dono. |

## Onde mexer

- Rotas: `apps/worker/src/app.ts`. Contratos das respostas: `packages/core/src/contracts.ts`.
- SQL: `apps/worker/src/repo.ts`; migrações só novas e aditivas em `apps/worker/migrations/`.
- Regras puras (sem rede): `packages/core` (agentes, aprovações, resumo do Correio, notícias, Dot).
- Interface: `apps/web/src` (estado em `store.tsx`, chamadas em `api.ts`).
- Publicação: `npm run deploy` (build, check, celular, migração, deploy, fumaça). Rollback: `wrangler rollback <id>` (id em `docs/STATUS.md`).
