# Relatório final — auditoria independente e preparação open source (Claude Code, 20/10/2026)

Nada foi publicado. Sem push, merge para `main`, tag, release, deploy, migração remota, mudança de visibilidade ou serviço pago. O remoto `origin` continua com push desabilitado.

## Git

| Item | Valor |
|---|---|
| SHA inicial (congelado) | `9e1b3fd853d37a26413c0f03c71238c96b43842d` (`codex/od2-runner-remediation`) |
| Branch segura, publicável | `claude/od2-audit` — HEAD: ver `git rev-parse claude/od2-audit` (este arquivo não contém o próprio SHA). Último SHA de código conferido antes deste relatório: `a1bfa5a` |
| Branch da interface | `claude/od2-ui` = `claude/od2-audit` em `70a3972` + 4 commits; HEAD `872056ce7705ef8a143ea7fb7f29482510f4c144` |
| Remoto `origin` | fetch `https://github.com/<OWNER>/open-dot.git` (URL original registrada no git config local); push = `DISABLED` |
| Autor local | nome do mantenedor + e-mail noreply do GitHub (`git config --local`) |
| Mapa de SHAs | não se aplica: histórico **não** reescrito |
| Worktree do Codex | intocado (`/private/tmp/open-dot-od2-remediation`) |

## Gate (resultados reais nesta máquina, macOS Intel, Node 24.21.0)

| Comando | `claude/od2-audit` | `claude/od2-ui` |
|---|---|---|
| `npm run check` (varredura + typecheck + testes + Python + eval + build) | PASS (353 Node, 7 Python) | PASS (354 Node) |
| `npm run lint` | 0 erros, 1 aviso preexistente (`DotView.tsx`) | idem |
| `npm run check:without-dot` | PASS | PASS |
| `npm audit` | 0 vulnerabilidades | — |
| `check-continuity --base 9e1b3fd` | 0 commits fora da política | — |
| `node scripts/license/spdx.mjs --check` | PASS | PASS |
| UI (`ui:fase-a/d/e/f/g`, `ui:rodada4`, `ui:runner`) | — | PASS (com build atualizado) |
| axe (serious/critical), 9 rotas × claro/escuro × 1440/390 | — | 0 depois da correção de `/rotinas`; sem overflow horizontal |
| `cargo test`, `test-runner-channel --recovery`, `cargo audit` | **não testado**: sem toolchain Rust | — |

## Achados por severidade

Detalhes, reprodução e áreas verificadas: `docs/audit/CLAUDE_INDEPENDENT_AUDIT.md`.

| ID | Sev. | Resumo | Status |
|---|---|---|---|
| 12 | P0 | Sem licença open source | Corrigido (AGPL + comercial + CLA; Dot só visualização). Revisão jurídica pendente |
| 01 | P1 | Início público do login revelava o e-mail do dono (`login_hint`) | Corrigido + teste |
| 02 | P1 | `wrangler.jsonc` apontava para a produção do mantenedor | Corrigido + teste; exige `.deploy.local.json` no próximo deploy |
| 15 | P1 | Produção mostra o e-mail pessoal em `/privacidade` (valor de `CONTACT_EMAIL`) | Ação do mantenedor |
| 03 | P2 | DoS no pareamento público (limite só global) | Corrigido (por origem + teto); risco residual: botnet |
| 04 | P2 | Início de login grava no banco sem limite | Corrigido |
| 05 | P2 | Modo só e-mail aceitava outra identidade Google | Corrigido + teste |
| 06 | P2 | CI: actions por tag, credencial persistida, jobs nativos em PR de fork | Corrigido + teste de política |
| 07 | P2 | Git do Runner herdava configuração global (filtros/LFS) | Corrigido no código, **não compilado** |
| 08 | P2 | Identificadores do mantenedor e nomes de outros projetos na árvore | Corrigido na árvore; permanecem no histórico |
| 09 | P2 | Scanner sem dados pessoais | Corrigido (árvore, preparado, histórico, CI, hook) |
| 14 | P2 | Provas Rust não reproduzidas | Bloqueado (toolchain) |
| 10 | P3 | Sem HSTS | Corrigido |
| 11 | P3 | Refs locais antigas (`refs/original`, `refs/codex/*`) | Mitigado: publicação envia só a `main` |
| 13 | P3 | `/dev/null` no Windows | Planejado (executor Windows desligado) |

## O que mais foi feito

- **Pendências:** driver Claude Code somente-proposta (fixtures; 2 chamadas reais ao CLI confirmaram flags e envelope, mas o login oficial da máquina estava **expirado**, sem geração; desligado salvo `OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code`; **não compilado**). Cursor marcado indisponível (sem modo sem ferramentas verificável; CLI ausente). Codex não estava instalado nesta máquina: **nenhuma chamada real ao Codex** nesta rodada. Retenção de 90 dias do conteúdo de tarefas do Runner (R07). `cargo audit` opt-in na CI; testes nativos macOS/Windows continuam opt-in e não foram disparados.
- **Licenças:** `LICENSE` (texto oficial da AGPL-3.0 do gnu.org, sha256 `0d96a4ff…abcb0`, **sem alteração**: o texto da AGPL não pode ser modificado; a política do Dot está em `NOTICE`, `LICENSE-DOT-ASSETS.md`, `TRADEMARK.md` e `README`), `COMMERCIAL-LICENSE.md`, `CLA.md` (bot ainda não existe), `LICENSE-DOT-ASSETS.md` (só visualização: ver e executar o app oficial sem modificações; proibido copiar, redistribuir, modificar, treinar IA, uso comercial), `LICENSE` curto em cada pasta do Dot, `TRADEMARK.md`, `REUSE.toml`, SPDX em todos os arquivos de código, inventário e SBOM em `docs/licencas/` (nenhuma dependência incompatível).
- **Dot:** continua o padrão e visível; nenhum arquivo de desenho, arte, som ou ícone mudou (só cabeçalho SPDX e linhas de import para a fronteira `@open-dot/mascot`). O **Marcador** (AGPL) existe só para quem redistribui ou faz fork, provado por `check:without-dot` na CI.
- **Docs públicas:** `README.md`/`README.en.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`, `CHANGELOG.md`, `docs/SETUP.md`, `docs/FORKS.md`, `docs/release/v0.1.0-beta.md`, `docs/audit/SEGURANCA_DO_MANTENEDOR.md`, `docs/audit/MANUAL_TEST_SCRIPT.md`; documentos antigos marcados como históricos (nada apagado).
- **Interface (`claude/od2-ui`):** telas Memória e handoff, Configurações e Mais (celular), cartões de resumo no Workspace, itens novos na barra lateral e no dock, correção de acessibilidade em Rotinas. Dados reais ou rotulados como indisponíveis/demonstração. As referências `docs/referencias/ux-pilot/` não foram versionadas (em `.git/info/exclude`). Capturas de validação ficaram fora do Git.

## Decisão sobre o histórico

**Não reescrito.** O inventário completo (176 commits, todas as refs locais, mensagens, 60 imagens abertas uma a uma, PR #1, 14 logs de Actions, artefatos, lista de segredos/variáveis) encontrou só: nome e e-mail noreply do mantenedor nos commits (aceitos), handle e subdomínio público da produção, um nome de usuário local em um caminho de documento, IDs de versão do Worker (inúteis sem acesso à conta), endereços de teste genéricos e o roteiro pessoal antigo (`docs/ACOES_DO_JOAO.md`, sem credenciais). Nenhuma credencial, token, host de banco real, dado de terceiro ou imagem com dado pessoal. Pela política do mantenedor, isso não justifica reescrita: os arquivos atuais foram corrigidos e o restante fica no histórico antigo. Backup não foi necessário porque nada destrutivo foi feito.

## Riscos residuais

- Código Rust novo (driver Claude, isolamento do Git) e as garantias do Runner sem execução de testes nesta auditoria.
- DoS distribuído do pareamento (teto global) e exclusão lógica de dados (backups do provedor).
- Instaladores não assinados; Runner só validado no macOS Intel em rodadas anteriores.
- Interface nova validada com dados de demonstração e API simulada, não com conta real.
- Textos de licença sem revisão jurídica.

## Checklist de prontidão para publicar

| Item | Estado |
|---|---|
| Nenhum segredo na árvore e no histórico | pronto |
| Dados pessoais fora da árvore atual | pronto |
| Configuração segura para quem clona | pronto |
| Correções P0/P1 de código com teste | pronto |
| CI endurecida, Dependabot, CODEOWNERS (placeholder) | pronto (trocar `<OWNER>`) |
| Licença, CLA, Dot, marca, NOTICE, SBOM | pronto como rascunho; revisão jurídica **pendente** |
| Contatos `[CONTATO_A_DEFINIR]` | **pendente** (mantenedor) |
| `cargo test` e roteiro manual | **pendente** (mantenedor) |
| Produção: `OWNER_GOOGLE_SUB`, contato público, `.deploy.local.json`, migração 0017 | **pendente** (mantenedor) |
| 2FA/chaves de acesso nas contas | **pendente** (mantenedor) |
| Script de publicação (dry-run por padrão) | pronto, não executado |
| Interface nova | pronta em branch separada; integração opcional (`INCLUDE_UI=1`) |

## Fora desta rodada (de propósito)

Shell e testes de projeto pelo Runner, paralelismo entre agentes, merge automático, commits ou push automáticos sem aprovação: maior superfície de risco, merecem auditoria própria depois da primeira publicação. Web Push: não implementado (aparece como “em desenvolvimento”). Caso legado de 500 eventos (R13): só registros antigos saturados exigem revisão manual; nada novo.

## Ações do mantenedor

1. Rodar `cargo test --locked` e o roteiro `docs/audit/MANUAL_TEST_SCRIPT.md` (seção 0 no mínimo).
2. Seguir `docs/audit/SEGURANCA_DO_MANTENEDOR.md`: 2FA/passkeys em Google, GitHub, Cloudflare, Turso, Vercel, ChatGPT/Codex e Claude; revisar sessões; **rotacionar** `TURSO_AUTH_TOKEN`, `GOOGLE_CLIENT_SECRET`, `TOKEN_KEYS` se houver qualquer dúvida.
3. Produção: definir `OWNER_GOOGLE_SUB`; trocar o contato público e remover `CONTACT_EMAIL` pessoal; criar `.deploy.local.json`; aplicar a migração 0017 antes do Worker novo.
4. Preencher `[CONTATO_A_DEFINIR]` e trocar `<OWNER>` no CODEOWNERS.
5. Revisão jurídica de `COMMERCIAL-LICENSE.md`, `CLA.md`, `LICENSE-DOT-ASSETS.md`, `TRADEMARK.md`.
6. Refazer o login oficial do Claude Code se quiser validar o driver experimental.
7. Decidir se a interface (`claude/od2-ui`) entra na primeira publicação.
8. Publicar com `scripts/release/PUBLISH.md` quando decidir. URL original do `origin`: o repositório privado atual do mantenedor no GitHub (registrada no `git config` local; push desabilitado).
