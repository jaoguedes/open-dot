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
- Heurística de perfil por palavras erra casos simples.
- Saída do modelo passa por `safeRunnerText` antes de ser validada: um texto parecido com segredo pode invalidar a saída (falha fechada, mas o passo bloqueia).
- 7 falhas antigas do `test:ui`.
- Instaladores não assinados; Runner só testado no macOS Intel.
