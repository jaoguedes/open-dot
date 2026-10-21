# Prontidão para publicar (v0.2)

Checklist do que falta antes de publicar. Nada aqui foi executado.

| Item | Estado | Como resolver |
|---|---|---|
| Contato público `[CONTATO_A_DEFINIR]` | pendente | `scripts/release/fill-contact.sh --dry-run <contato>` e depois sem `--dry-run`; use alias ou link de issues |
| `OWNER_GOOGLE_SUB` em produção | pendente | `npx wrangler secret put OWNER_GOOGLE_SUB` |
| 2FA/chaves de acesso e revisão de sessões | pendente | `docs/audit/SEGURANCA_DO_MANTENEDOR.md` |
| Rotação de segredos (se houver dúvida) | pendente | idem |
| Contato público de produção sem e-mail pessoal | pendente | Conexões → Contato público; remover `CONTACT_EMAIL` pessoal |
| Migrações `0017` e `0018` na produção | pendente | `npm run deploy` aplica antes do Worker novo (expansão apenas); conferir backup do Turso antes |
| `.deploy.local.json` com a origem da instância | pendente | `npm run setup:cloud` |
| `cargo test` | **pronto nesta máquina** (34 PASS) | CI nativa opt-in (`RUNNER_BUILDS_ENABLED`) para ARM64/Windows |
| Roteiro manual (GUI nativa, iPhone, Windows) | pendente | `docs/audit/MANUAL_TEST_SCRIPT.md` |
| Revisão jurídica (AGPL, comercial, CLA, Dot, marca) | pendente | advogado |
| Decisão sobre a interface (`claude/od2-ui`) | pendente | já integrada em `integration/v0.2-candidate`; publicar com `INCLUDE_UI=1` ou a partir da integração |
| Decisão sobre o v0.2 (`claude/od2-v02`) | pendente | publicar só a auditoria, ou a integração com v0.2 + interface |
| 7 falhas preexistentes do `test:ui` | pendente | não bloqueiam (existem desde a base), mas valem correção |
| CODEOWNERS | pronto | `@jaoguedes` |
| Varredura de segredos/dados pessoais | pronto | limpa na árvore |

## Comandos de publicação (NÃO executados)

Plano (não altera nada):

```bash
REPO=jaoguedes/open-dot scripts/release/publish.sh
```

Execução, quando decidir (exige digitar o nome do repositório; envia só a `main`):

```bash
REPO=jaoguedes/open-dot EXPECTED_SHA=$(git rev-parse claude/od2-audit) scripts/release/publish.sh --execute
```

Observação: o script integra `claude/od2-audit` (e, com `INCLUDE_UI=1`, `claude/od2-ui`). Para publicar o v0.2 com a interface, ajuste o script para integrar `integration/v0.2-candidate` no lugar da auditoria, ou faça o merge local dessa branch na `main` antes, revisando o diff. Histórico não foi reescrito; não é preciso recriar o repositório remoto.
