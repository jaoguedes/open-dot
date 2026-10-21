# Relatório do v0.2 — motor de orquestração (21/10/2026)

Nada publicado: sem push, merge na `main`, tag, release, deploy, migração remota ou mudança de visibilidade. Push do `origin` continua `DISABLED`.

## SHAs

| Branch | SHA |
|---|---|
| Base (`claude/od2-audit`) | `d9fe92d6f1b8e1ce49d328f5b37abe3689a645e8` |
| `claude/od2-v02` | este relatório entra num commit depois de `287dfb4`; confira com `git rev-parse claude/od2-v02` |
| `integration/v0.2-candidate` | `53f0b02` (merge de `claude/od2-ui` em `claude/od2-v02@287dfb4`), seguido do merge deste relatório; confira com `git rev-parse integration/v0.2-candidate` |
| `claude/od2-ui` (entrada) | `872056ce7705ef8a143ea7fb7f29482510f4c144` |

## O que foi feito por fase

| Fase | Entrega |
|---|---|
| 0 | Branch criada no SHA exigido; Rust 1.99.1 instalado com `rustup` no diretório do usuário (exceção prevista); `docs/orquestrador/PLANO_V02.md`, `AMBIENTE.md`, `FLAGS_VERIFICADAS.md`. **Primeiro `cargo test` desta máquina: tudo compilou**, inclusive o código Rust nunca compilado da rodada anterior. |
| 1 | Catálogo (`orchestrator/catalog/ferramentas.json`) com fonte e data por fato; parsers de detecção (TS) com fixtures; detector no Runner (`tools.rs`), snapshot sem credenciais por canal autenticado; migração `0018` (não aplicada em produção). |
| 2 | Formato de agentes, carregador (recusa permissões, tamanho, hash divergente, injeção no corpo), cinco especialistas densos com rubrica, esquema e 3 evals cada. |
| 3 | Perfil do projeto, cota (limite do usuário e aprendido por erro), pesos explicados, seletor determinístico com restrições duras, explicação, troca manual, estimativa; rotas de equipe, configurações (opt-in do Claude com aviso) e cota. |
| 4 | `respond` nos drivers Codex e Claude (papéis só leitura), executor por papel, pipeline sequencial no Worker com validação por esquema, aprovação por hash no implementador, registro de cota e resultados; Claude para em limite de uso e só executa com login de assinatura. |
| 6 | Registro de resultados (`GET /api/orchestrator/outcomes`, sem ajuste automático); 12 tarefas golden; comparação motor × padrão simples. |
| 5 | Tela **Equipe** (ferramentas, cota, opt-in do Claude, equipe com motivos e troca, execução confirmada, equipes recentes). |
| 7 | Docs do orquestrador, README pt/en, STATUS, ROADMAP, CHANGELOG, CODEOWNERS com `@jaoguedes`, `fill-contact.sh`, integração local com a interface. |

19 commits em `claude/od2-v02` antes deste relatório, todos com `Task:` e Conventional Commits (`check-continuity`: 0 fora da política).

## Estado honesto

| Item | Estado |
|---|---|
| `npm run check` (386 Node, 7 Python, eval, typecheck, build) | **testado** |
| `cargo test --locked` (34 passam, 8 ignorados por exigirem rede/modelo) | **testado** |
| Recuperação integrada (`test-runner-channel --recovery`, Keychain/SQLite/HTTP reais) | **testado** |
| Detecção nesta máquina: Codex 0.163.0 logado (ChatGPT), Claude Code 2.1.296 **sem login**, Gemini/Cursor ausentes | **testado** (real) |
| Codex como planejador e revisor | **testado com 2 chamadas reais**: saída válida no esquema, revisão reprovou o defeito plantado, nada escrito no projeto |
| Codex como implementador no pipeline v0.2 | **sem teste real** neste ciclo (o fluxo de proposta é o mesmo validado em rodadas anteriores) |
| Claude Code em qualquer papel | **sem teste real**: login oficial expirado; não contornado |
| Pipeline de ponta a ponta | **simulado** (Runner simulado nos testes do Worker) |
| Comparação motor × padrão simples | **simulado** |
| Tela Equipe | **testado** com o snapshot real deste Mac via pareamento de teste no `npm run dev`; axe sem achados |
| Gemini CLI, Cursor | **indisponível** (flags não verificadas localmente; Gemini não tem modo só leitura estrito) |
| H (catálogo automático), ACP, paralelismo, testes em sandbox | **planejado** |
| Migrações 0017/0018 em produção, publicação | **bloqueado** (decisão do mantenedor) |

## Gate

| Verificação | `claude/od2-v02` | `integration/v0.2-candidate` |
|---|---|---|
| `npm run check` | PASS | PASS |
| `npm run check:without-dot` | PASS | PASS (363 testes sem o Dot) |
| `cargo test --locked` | 34 PASS | 34 PASS |
| `ui:fase-a/d/e/f/g`, `ui:rodada4`, `ui:runner` | PASS | PASS |
| `npm run test:ui` (dev com banco limpo) | 77/84 | 77/84 |
| Mesmo `test:ui` na base `claude/od2-audit` | 77/84 — **as 7 falhas são preexistentes** (erros 401 de console em páginas públicas, atalho ⌘K, altura do primeiro cartão) | — |
| axe (Equipe, Memória, Configurações, Mais, Workspace, Rotinas × claro/escuro × 1440/390) | — | 0 achados sérios, sem overflow |
| Varredura de segredos e dados pessoais | limpa | limpa |
| `npm audit` | 0 vulnerabilidades | 0 |
| SPDX | ok | ok |

## Motor × padrão simples (simulado, `docs/orquestrador/AVALIACAO.md`)

- Perfil correto em 11/12 (erra “renomear arquivos”: a palavra “arquivo” eleva o risco).
- Papéis que a ideia pede: motor 12/12, padrão 5/12. Login possivelmente pago: motor 0/12, padrão 12/12 no cenário com chave de API.
- Custo: motor 3,75 chamadas por ideia, padrão 2,00.
- **O motor não demonstrou qualidade superior.** Só cobertura de papéis, independência da revisão e respeito às restrições, ao custo de quase 2× chamadas. Medir qualidade exige chamadas reais em escala.

## Flags verificadas

Ver `docs/orquestrador/FLAGS_VERIFICADAS.md`. Claude Code e Codex verificados localmente (`--help` e execução); Gemini só por documentação (indisponível); Cursor nenhuma (indisponível). `--max-turns` do Claude não existe nesta versão e não é usado.

## Desvios deste prompt

- **Codex foi encontrado** dentro do app ChatGPT (a rodada anterior disse “ausente”); usei 2 das 3 chamadas permitidas.
- O plano grátis do Gemini (60/min, 1.000/dia) **não está mais no README oficial**: ficou `null` no catálogo.
- A migração `0018` cresceu durante a rodada (tabelas de cota, configurações e pipeline); ela nunca foi aplicada fora de bancos descartáveis.
- O handle `jaoguedes` saiu do `.pii-terms.local` (arquivo local, ignorado) porque agora aparece de propósito em CODEOWNERS e links.
- As 7 falhas preexistentes do `test:ui` não foram corrigidas (fora do escopo; registradas).

## O que depende do João

1. Entrar no Claude Code (`claude`, `/login`) se quiser validar o driver; ligar o opt-in em Equipe e no Runner (`OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code`), mantendo o uso extra desligado.
2. Abrir o Runner real (app) para o diagnóstico rodar o preflight do Codex: só assim a equipe sai “pronta” nesta máquina.
3. Decidir a publicação e seguir `docs/audit/PUBLISH_READINESS.md`.

## Riscos abertos

- Qualidade do resultado dos especialistas não medida em escala.
- Heurística de perfil por palavras ainda erra (15/16 no golden; falha do lado seguro).
- Saída do modelo passa por `safeRunnerText` antes de ser validada: um texto parecido com segredo pode invalidar a saída (falha fechada, mas o passo bloqueia).
- 1 falha do `test:ui` (altura do 1º cartão no celular, decisão de design).
- Instaladores não assinados; Runner só testado no macOS Intel.

## Rodada de fechamento (21/10/2026)

Branch `release/v0.2`, criada de `integration/v0.2-candidate` = `df67198f42eefc1d1193f51ccf397b925222959e` (a mudança de uma linha no `Cargo.lock` foi descartada). Nada publicado; sem merge na `main`; push do `origin` continua `DISABLED`.

| SHA | Item |
|---|---|
| `c954236` | 1. Contato público em `SECURITY.md`, `COMMERCIAL-LICENSE.md`, `LICENSE-DOT-ASSETS.md`, `TRADEMARK.md`, `CODE_OF_CONDUCT.md` (via `fill-contact.sh`, dry-run e real). Allowlist versionada por hash (`scripts/lib/pii-allowlist.json`); teste prova que o endereço continua recusado em qualquer outro arquivo. |
| `3883e09` | 2. `publish.sh` para `refs/heads/release/v0.2`, `EXPECTED_SHA` obrigatório, tag `v0.2.0-beta`, notas `docs/release/v0.2.0-beta.md`; aborta com e-mail gmail em commit alcançável, arquivo privado rastreado ou varredura com achado; envia só `main` e a tag; lista refs remotas e avisa, sem apagar. |
| `767192c` | 3. Gemini: 1.000 req/dia (login Google, Code Assist Individual) e 250/dia (chave gratuita, só Flash), fonte `docs/resources/quota-and-pricing.md` do repositório oficial, consultada em 21/10/2026. Limite por minuto sem número publicado. |
| `1909fc1` | 4. `test:ui`: os erros 401 vinham do `/api/snapshot` no boot de visitante (agora consulta a sessão antes); ⌘K falhava porque a paleta era carregada sob demanda (agora pré-carregada). |
| `443c218` | 5. Heurística de risco: “arquivo” sozinho deixou de ser risco médio; e-mail/apagar/sobrescrever/remédio são alto; documentos de clientes/pacientes são médio; “automatizar” reconhecido. Golden 13–16 acrescentados. |
| `2faa3f2` | 6 e 10. `docs/audit/INVENTARIO_LICENCAS.md`; aviso de modelo sem revisão no topo de `LICENSE-DOT-ASSETS.md`, `COMMERCIAL-LICENSE.md`, `CLA.md`, `TRADEMARK.md` (`LICENSE` intacto). |
| `4ae3ce9` | 7. PRs bem-vindos para análise (CONTRIBUTING, READMEs, notas); merge só com revisão do mantenedor, CI verde e aceite do CLA; `.github/PULL_REQUEST_TEMPLATE.md` com caixa obrigatória e lembrete de código não confiável; teste novo: nenhum workflow usa `secrets`, `workflow_run` ou escrita em gatilho de PR. |
| commit deste relatório | 8. `PUBLISH_READINESS.md`, `STATUS.md`, `CHANGELOG.md`, handoff, continuidade. |

### `test:ui`: das 7 falhas antigas, 6 corrigidas

| Falha | Causa | Resultado |
|---|---|---|
| 5 × erro 401 no console em páginas públicas | boot pedia `/api/snapshot` sem sessão | **corrigida** |
| ⌘K não abria a paleta | `lazy()` ainda carregando quando o teste checava | **corrigida** (pré-carga após 1,5 s; abre síncrona) |
| Tela 02 (390 px): 1º cartão acima do dock | o 1º cartão da demonstração (resumo do Correio, todos os itens expandidos) mede 1.748 px; termina em 2.440 px e o dock está em 770 px | **não corrigida**: decisão de design (resumir ou recolher o cartão no celular). A asserção não foi relaxada. |

### Avaliação golden depois da correção da heurística

Perfil 15/16 (erra “logs-locais”: “conta erros” lido como conta de usuário, falso positivo do lado seguro). Papéis: motor 16/16, padrão simples 8/16. Custo: 3,63 chamadas por ideia × 2,00. Continua **simulado**; o motor não demonstrou qualidade superior.

### Gate em `release/v0.2@4ae3ce9`

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS — 392 testes Node, 7 Python, `eval:correio`, typecheck, build |
| `node scripts/check-without-dot.mjs` | PASS — 371 testes, 369 passam, 0 falhas; bundle sem desenho do Dot |
| `cargo test --locked` | 34 PASS, 8 ignorados (rede/modelo) |
| `npm run test:ui` (worktree descartável, banco limpo, porta 8793) | 83/84 |
| Varredura de segredos e dados pessoais | limpa (713 arquivos) |
| `npm audit` | 0 vulnerabilidades |
| Primeira tela | 356,0 KB (meta 350 KB): aviso **preexistente** (355,7 KB na base `df67198`); a pré-carga da paleta somou 0,3 KB |

O plano de `publish.sh` (dry-run) é rodado no SHA final da branch; a saída fica na mensagem final da rodada, porque um arquivo não pode registrar o SHA do próprio commit.
