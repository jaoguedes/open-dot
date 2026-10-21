# Prontidão para publicar (v0.2.0-beta)

Checklist do que falta antes de publicar `release/v0.2`. Nada aqui foi executado pelo agente. Atualizado em 21/10/2026 (rodada de fechamento).

| Item | Estado | Como resolver |
|---|---|---|
| Contato público nos documentos | **resolvido** | preenchido por `fill-contact.sh` em `SECURITY.md`, `COMMERCIAL-LICENSE.md`, `LICENSE-DOT-ASSETS.md`, `TRADEMARK.md` e `CODE_OF_CONDUCT.md`; permitido só nesses cinco (`scripts/lib/pii-allowlist.json`, com teste) |
| Contato público de produção (`CONTACT_EMAIL`) | **decidido pelo João**: continua o e-mail pessoal | — |
| `OWNER_GOOGLE_SUB` em produção | **feito pelo João** | — |
| Backup do Turso | **feito pelo João** | — |
| `.deploy.local.json` com a origem da instância | **feito pelo João** | — |
| Migrações `0017` e `0018` na produção | pendente (João) | `npm run deploy` aplica antes do Worker novo (só expansão) |
| 2FA/chaves de acesso e revisão de sessões | pendente (João) | `docs/audit/SEGURANCA_DO_MANTENEDOR.md` |
| Rotação de segredos (se houver dúvida) | pendente (João) | idem |
| Revisão jurídica (comercial, CLA, Dot, marca) | pendente (advogado) | `docs/audit/INVENTARIO_LICENCAS.md` lista textos, campos em aberto e assets com origem PENDENTE |
| Origem dos ícones do app/Runner e das duas pranchas do Dot | pendente (João) | confirmar autoria/ferramenta (`INVENTARIO_LICENCAS.md`, seção a) |
| Branch remota `codex/runner-safe-edit-beta` e PR #1 | pendente (João) | ficam públicos ao mudar a visibilidade; o script avisa e não apaga |
| Roteiro manual (GUI nativa, iPhone, Windows) | pendente (João) | `docs/audit/MANUAL_TEST_SCRIPT.md` |
| Login do Claude Code (se quiser validar o driver) | pendente (João) | `claude` → `/login` |
| Decisão de publicar | pendente (João) | `scripts/release/PUBLISH.md` |
| `test:ui` | 83/84 | a falha restante (altura do 1º cartão em 390 px na demonstração) é decisão de design, registrada em `V02_REPORT.md` |
| `cargo test --locked` | pronto nesta máquina | CI nativa opt-in (`RUNNER_BUILDS_ENABLED`) para ARM64/Windows |
| PRs de terceiros | pronto | bem-vindos para análise; merge só com revisão, CI verde e caixa do CLA; CI de PR sem segredos nem escrita (teste em `tests/workflow-policy.test.ts`) |
| CODEOWNERS | pronto | `@jaoguedes` |
| Varredura de segredos/dados pessoais | pronto | limpa na árvore |

## Comandos de publicação (NÃO executados)

Plano (não altera nada; aborta se algo falhar):

```bash
git switch release/v0.2
REPO=jaoguedes/open-dot EXPECTED_SHA=$(git rev-parse release/v0.2) scripts/release/publish.sh
```

Execução, quando decidir (pede que você digite o nome do repositório; envia só a `main` em avanço rápido e a tag `v0.2.0-beta`):

```bash
REPO=jaoguedes/open-dot EXPECTED_SHA=<sha revisado> scripts/release/publish.sh --execute
```

Histórico não foi reescrito; não é preciso recriar o repositório remoto.
