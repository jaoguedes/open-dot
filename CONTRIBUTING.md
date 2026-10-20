# Como contribuir

## Regra de ouro

**O app prepara, o usuário aprova.** Nenhuma escrita fora do Open Dot (enviar e-mail, abrir issue, redeploy, publicar post) acontece sem uma aprovação ligada ao conteúdo exato: a tela mostra o texto, guarda o hash, e o servidor só aceita a decisão se versão e hash baterem (`repo.decideApproval`). Conteúdo externo (e-mail, feed, página) é dado, nunca instrução. O supervisor de permissões é código (`authorizeTool`), não o modelo.

Outras regras fixas estão em `CLAUDE.md` (custo R$ 0, demonstração só em `apps/web/src/demo.ts`, segredos fora do git e dos logs, Gmail/GitHub/Vercel só leitura).

## Rodar

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:8787 com API, banco SQLite em `.data/` e agendador local. Sem conta nenhuma, use `npm run demo` (dados fictícios, rotulados).

## Testar

| Comando | O que faz |
|---|---|
| `npm run check` | typecheck + testes + Blender + build. Precisa passar antes de qualquer commit. |
| `npm test` | só os testes (`node --test`). |
| `npm run ui:mobile` | celular 390×844 contra o `npm run dev`. |
| `npm run ui:fase-a` / `npm run ui:fase-d` | navegador com API simulada contra o `apps/web/dist` (não precisa do dev). |
| `npm run test:ui` | roteiro de navegador mais longo (com o dev rodando). |
| `npm run eval:ai` | avaliação da triagem com o provedor falso. |

Cada correção vem com um teste que falha antes e passa depois. Para provar o “antes” de uma tela, gere o build de um commit antigo num worktree e rode o roteiro com `--dist` (veja `docs/RODADA3_LOG.md`).

## Adicionar um agente

1. Em `packages/core/src/types.ts`, acrescente o id em `AGENT_IDS`.
2. Em `packages/core/src/agents.ts`, crie o perfil em `AGENTS` (nome, descrição, ferramentas, classe de dado, limites) e diga em quais lugares ele aparece em `PLACES` (`list`, `pills`, `mood`, `presence`, `status`, `mascot`).
3. Separe perfil de agente de mecanismo: identidades em `packages/core/src/mechanisms.ts`. Preserve Dot original, sem tingimento/skins/badges; paleta de mecanismos só na interface. Não adicione acessórios por inferência do perfil.

Barra lateral, faixa de agentes, busca, pílulas do Meu dia, ilha, `/api/status` e a tela Mascote leem o registro (`agentsInPlace`). Não escreva listas de agentes à mão: `packages/core/test/registry.test.ts` falha se uma tela fizer isso.

Ferramentas de escrita entram em `REQUIRES_APPROVAL`. Um agente novo começa só com leitura.

## Banco

Migrações só novas e aditivas (`apps/worker/migrations/0007_…sql`): `ADD COLUMN` ou `CREATE TABLE IF NOT EXISTS`. Nunca edite uma migração aplicada nem apague coluna. A ordem de publicação é expandir → publicar → (muito depois) contrair (`docs/DECISOES.md`, D-020).

## Commits

Pequenos, um por tema, Conventional Commits (`feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `chore`, `ci`) com trailer `Task: ID`. Checkpoint ao concluir uma unidade ou após cerca de 30 minutos significativos. Branch/worktree próprios e revisão de diff/segredos/PII antes de stage explícito. Commit local não autoriza push; nenhuma reescrita de histórico compartilhado. Ao terminar, atualize `docs/STATUS.md` separando testado, sem teste real, simulado, planejado e bloqueado.
