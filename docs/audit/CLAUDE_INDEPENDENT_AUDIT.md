# Auditoria independente — Claude Code (20/10/2026)

Autor: Claude Code, em branch própria `claude/od2-audit`, criada a partir do ponto congelado `9e1b3fd853d37a26413c0f03c71238c96b43842d` (`codex/od2-runner-remediation`). Os relatórios do Codex foram lidos, mas **não** foram aceitos como prova: cada área abaixo foi relida no código e, quando possível, exercitada com teste negativo próprio.

Valores sensíveis nunca aparecem neste documento. Onde um achado envolve dado pessoal ou segredo, registro só caminho, linha, tipo e commit, com `[REDIGIDO]`.

## Ambiente e gate reproduzido

| Item | Resultado real nesta máquina |
|---|---|
| Node / npm | v24.21.0 / 11.19.0 (macOS x86_64, Intel) |
| `npm ci` | OK, 9,5 s; 0 vulnerabilidades; scripts de instalação só em `esbuild` e `fsevents` |
| `npm run check` | OK, 27 s: 322/322 testes Node, 7/7 Python, eval Correio, typecheck e build |
| `npm run lint` | 0 erros, 1 aviso preexistente (`DotView.tsx:390`, hook) |
| `npm audit` | 0 vulnerabilidades |
| `check-continuity --base 9e33c3b…` | 38 commits verificados, 0 fora da política |
| `cargo test --locked` | **não testado**: não há toolchain Rust nesta máquina (`cargo`/`rustc` ausentes do PATH e do disco). A instalação exigiria rede fora dos registros permitidos |
| `test-runner-channel.ts --recovery` | **não testado**: o script chama `cargo` e falha com código 1 sem ele |
| `cargo audit` / `cargo deny` | **não testado**: ferramentas ausentes |

Consequência: as garantias do Runner (Rust) foram verificadas por leitura de código, não por execução. As 24 provas Rust relatadas pelo Codex não foram reproduzidas aqui. Isso está no registro de riscos (OD2-CLAUDE-14).

## Achados

Severidade: P0 bloqueia publicação; P1 alto; P2 médio; P3 baixo. O status e o SHA de cada correção estão na tabela de status no fim do documento.

### OD2-CLAUDE-01 · P1 · E-mail do dono exposto sem login pelo início do OAuth

- **Arquivo:** `apps/worker/src/app.ts:277-280` (rota `GET /api/auth/google/start`, `auth:false`) e `packages/connectors/src/google.ts:29`.
- **Reprodução:** `curl -sI https://<instância>/api/auth/google/start` → o cabeçalho `Location` aponta para o Google com `login_hint=<OWNER_EMAIL>`.
- **Efeito:** qualquer pessoa descobre o e-mail de login do dono de qualquer instância publicada, sem credencial. Facilita phishing direcionado ao dono e contradiz o princípio “um e-mail conhecido não dá acesso a nada; nem deve ser revelado”.
- **Correção mínima:** não enviar `login_hint` no login. O Google mostra o seletor de contas; a autorização continua por `sub`/e-mail verificado no retorno.

### OD2-CLAUDE-02 · P1 · Configuração versionada aponta para a produção do mantenedor

- **Arquivo:** `wrangler.jsonc:21` (`APP_ORIGIN` com o subdomínio pessoal `[REDIGIDO]`) e `wrangler.jsonc:23` (`OWNER_NAME`).
- **Efeito:** quem clona e implanta herda origem, redirect OAuth e nome do mantenedor; o CSRF compara com a origem errada e o OAuth redireciona para a instância do mantenedor. Também identifica a instância de produção no repositório público.
- **Correção mínima:** placeholders (`https://open-dot.<SEU-SUBDOMINIO>.workers.dev`), `OWNER_NAME` vazio, e o Worker recusa iniciar com origem contendo placeholder (falha fechada). `setup-cloud` pergunta os valores.

### OD2-CLAUDE-03 · P2 · Pareamento público com limite só global (negação de serviço)

- **Arquivo:** `apps/worker/src/runner/routes.ts:116-132`.
- **Reprodução (teste negativo):** 30 chamadas anônimas a `POST /api/runner/pairings` em 5 minutos → a 31ª, inclusive a do dono, recebe 429.
- **Efeito:** qualquer pessoa impede o dono de parear um Runner indefinidamente, a custo quase zero. Cada chamada também grava no banco (cota do plano gratuito).
- **Avaliado e descartado:** exigir sessão do dono para iniciar o pareamento muda o protocolo do Runner (Rust), que não pode ser compilado nesta máquina. Fica como opção de desenho para o mantenedor.
- **Correção mínima:** limite por origem (hash SHA-256 de `cf-connecting-ip`, nunca o IP cru) de 5 por 5 minutos, mais teto global de 200 por 5 minutos, em tabela própria (`od_rate_limits`, migração 0017, somente expansão). Risco residual: uma botnet com dezenas de IPs ainda esgota o teto global.

### OD2-CLAUDE-04 · P2 · Início do login sem limite grava no banco sem autenticação

- **Arquivo:** `apps/worker/src/app.ts:277-280`, `apps/worker/src/repo.ts:64`.
- **Efeito:** cada `GET /api/auth/google/start` anônimo insere um estado OAuth. Em volume, consome a cota de escrita do banco gratuito (o plano não tem cobrança extra, então o efeito é indisponibilidade, não custo).
- **Correção mínima:** mesmo limitador por origem (20 por 10 minutos) antes de gravar.

### OD2-CLAUDE-05 · P2 · Modo só `OWNER_EMAIL` aceita outra identidade Google

- **Arquivo:** `apps/worker/src/app.ts:326-334` e `apps/worker/src/repo.ts:15-21`.
- **Reprodução (teste negativo):** com só `OWNER_EMAIL`, entrar com `sub=A` e depois com `sub=B` e o mesmo e-mail verificado → dois registros em `od_owners`, o segundo com dados vazios e sessão válida.
- **Efeito:** se o endereço for reatribuído (conta Workspace recriada, domínio próprio transferido), outra identidade entra. Não há senha armazenada; a falha depende de controle do e-mail, mas o produto é de dono único.
- **Verificado sem achado:** com as duas variáveis ausentes ninguém entra (`configured.owner=false` e `allowed=false`); só `OWNER_EMAIL` exige `email_verified=true`; `OWNER_GOOGLE_SUB` tem precedência.
- **Correção mínima:** no modo só e-mail, o primeiro `sub` aceito fica fixado; outro `sub` é recusado. Documentar `OWNER_GOOGLE_SUB` como obrigatório para produção.

### OD2-CLAUDE-06 · P2 · CI e cadeia de suprimentos

- **Arquivos:** `.github/workflows/ci.yml`, `runner-ci.yml`, `runner-release.yml`.
- **Achados:** actions referenciadas por tag móvel (`@v4`, `@stable`), `actions/checkout` sem `persist-credentials: false`, job nativo do Runner sem guarda explícita contra PR de fork (usa só `vars`), cache npm reaproveitado no fluxo de release, sem Dependabot.
- **Verificado sem achado:** nenhum `pull_request_target`; `permissions: contents: read` no topo; draft de release exige `workflow_dispatch`, tag `runner-v*`, variável e environment protegido; nenhum segredo referenciado pelos jobs de PR.
- **Correção mínima:** fixar por SHA (com a tag em comentário), `persist-credentials: false`, guarda de fork, sem cache no release, `dependabot.yml`.

### OD2-CLAUDE-07 · P2 · Git do Runner herda configuração global e de sistema na criação do worktree

- **Arquivo:** `apps/runner/src-tauri/src/worktree.rs:28-45`.
- **Efeito:** o ambiente é limpo (`env_clear`, então `GIT_DIR`, `GIT_SSH_COMMAND`, `GIT_ASKPASS` e `GIT_EXEC_PATH` não passam; verificado), mas `HOME` e `PATH` passam. `git archive` aplica filtros de conteúdo definidos na configuração global (ex.: `filter.lfs.smudge`), o que pode executar programas e usar rede/credenciais durante a criação do snapshot. O commit (`git_checkpoint.rs`) já isola `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM`, o worktree não.
- **Correção mínima:** mesmas variáveis de isolamento no `worktree::git`. **Não compilado nesta máquina** (ver OD2-CLAUDE-14); exige `cargo test` do mantenedor.

### OD2-CLAUDE-08 · P2 · Dados do mantenedor e de outros projetos na árvore atual

- **Locais:** subdomínio/handle de produção `[REDIGIDO]` em `wrangler.jsonc:21`, `scripts/smoke-public.mjs:2`, `docs/STATUS.md:184-217`, `docs/CONTINUIDADE.md:47,89`, `docs/open-dot-runner-release.md:64-84`, `docs/audit/IMPLEMENTATION_REPORT.md:106`, `docs/audit/SYNC_REVIEW.md:35`, `docs/agent-workspace/RESULTADO_OPERACIONAL.md:34`; caminho `/Users/[REDIGIDO]` em `docs/RODADA4_LOG.md:15`; host de banco de exemplo com nome pessoal em `tests/hrana.test.ts`; endereços de teste em domínios reais (`gmail.com` e outros) em testes e `apps/web/src/demo.ts`; `docs/ACOES_DO_JOAO.md` (roteiro pessoal de contas, cita a exposição do e-mail em produção); nomes de outros projetos do mantenedor em `CLAUDE.md`, `docs/DECISOES.md`, `docs/PROGRESSO.md`, `docs/REVISAO_DO_PDF.md`, `docs/referencias/dot_*.html` (regra 9).
- **Efeito:** expõe identificadores pessoais e a instância de produção; menciona outros projetos.
- **Correção mínima:** substituir por placeholders e domínios reservados (`example.com`, `example.invalid`, `.test`), mover o roteiro pessoal para pasta ignorada, generalizar as menções.

### OD2-CLAUDE-09 · P2 · Scanner não cobre identificadores pessoais

- **Arquivo:** `scripts/lib/secret-scan.mjs`.
- **Efeito:** padrões só de segredo; não detectam e-mail em domínio real, `/Users/<nome>`, subdomínio `workers.dev`, host de banco, telefone, CPF/CNPJ, nem varrem o histórico.
- **Correção mínima:** regras de dados pessoais com lista de domínios permitidos, modo `--history`, hook de pré-commit opcional e job de CI.

### OD2-CLAUDE-10 · P3 · Sem HSTS

- **Arquivos:** `apps/worker/src/http.ts` (`SECURITY_HEADERS`) e `_headers` gerado por `scripts/build.mjs`.
- **Efeito:** `.dev` (inclusive `workers.dev`) já está na lista de pré-carga HSTS, mas um fork com domínio próprio fica sem a proteção.
- **Correção mínima:** `strict-transport-security: max-age=31536000` (sem `includeSubDomains`, para não afetar outros serviços do domínio de um fork).

### OD2-CLAUDE-11 · P3 · Referências locais com histórico antigo

- **Local:** `refs/original/refs/heads/main` (resto de reescrita antiga), `refs/codex/turn-diffs/...`, branch `backup-antes-do-github`.
- **Efeito:** só local; seria publicado por `git push --mirror` ou `--all`. A varredura do histórico (área 11) não encontrou credencial nesses objetos.
- **Correção mínima:** o script de publicação envia somente refs explícitas e recusa `--mirror`/`--all`.

### OD2-CLAUDE-12 · P0 · Sem licença de código aberto

- **Arquivos:** `package.json` (`UNLICENSED`, `private: true`), `apps/runner/src-tauri/Cargo.toml` (`LicenseRef-Proprietary`), ausência de `LICENSE`.
- **Efeito:** publicar sem licença deixa o código “todos os direitos reservados” por omissão e contradiz a decisão do mantenedor (AGPL-3.0 + comercial; Dot com licença própria).
- **Correção:** Etapa 4 (licenciamento). Revisão jurídica humana continua pendente.

### OD2-CLAUDE-13 · P3 · `core.hooksPath=/dev/null` no Windows

- **Arquivo:** `apps/runner/src-tauri/src/worktree.rs:32`.
- **Efeito:** no Windows o caminho não existe. Hoje sem impacto: o executor exige macOS (`codex::preflight`) e o commit é recusado no Windows (`git_checkpoint.rs`). Vira risco quando o Windows for habilitado.
- **Recomendação:** usar `NUL` no Windows e validar no ensaio nativo. Planejado.

### OD2-CLAUDE-14 · P2 · Garantias do Runner sem prova reproduzida nesta auditoria

- **Causa:** sem toolchain Rust. Leitura de código confirmou: aprovação vinculada ao hash e reverificada no host (`executor.rs:102-121`), aplicação só com `beforeHash` conferido e sem symlink (`worktree.rs:191-303`), commit apenas por plumbing com índice próprio, sem hooks, filtros, push ou merge (`git_checkpoint.rs`), filho com ambiente mínimo, grupo de processos e `SIGKILL` no encerramento (`process.rs`), token só no cofre do sistema (`channel.rs`).
- **Ação:** o mantenedor roda `cargo test --locked` e o roteiro manual (`docs/audit/MANUAL_TEST_SCRIPT.md`) antes de publicar instaladores.

### OD2-CLAUDE-15 · P1 · Produção mostra o e-mail pessoal do mantenedor na página pública de privacidade

- **Origem:** `docs/ACOES_DO_JOAO.md` (item 0.1) registra que o segredo `CONTACT_EMAIL` de produção contém um endereço pessoal `[REDIGIDO]`, exibido sem login por `/api/legal` e `/privacidade`. O código está correto (contato público é intencional); o valor configurado é o problema.
- **Ação do mantenedor:** trocar por alias ou link de issues (Conexões → Contato público) e remover o segredo. Não alterei produção.

## Áreas verificadas

| # | Área | Resultado |
|---|---|---|
| 1 | Aprovação exata e anti-replay (`runner/routes.ts`, `executor.rs`) | **Verificado.** Digest SHA-256 do texto exato; `UPDATE … WHERE digest=? AND decision='pending' AND expires_at>?` com escopo de dono, tarefa e dispositivo não revogado; uso único (decisão sai de `pending`); expiração 10 min; Runner refaz o hash da proposta servida e compara com o journal antes de escrever. Testes negativos existentes cobrem hash errado, reuso e expiração; acrescentei casos (ver status). Lado Rust só por leitura. |
| 2 | Commits e escrita do Runner | **Achado** OD2-CLAUDE-07 e 13. Sem injeção de pathspec (`--literal-pathspecs`, `--cacheinfo`, caminhos validados), symlink e traversal recusados, TOCTOU mitigado por `beforeHash` e reconferência, limites de 8 arquivos/8 KB, padrões de segredo bloqueiam commit, commit nunca vira push. Não executado (Rust). |
| 3 | Pareamento, cofre, revogação | **Achado** OD2-CLAUDE-03. Token 256 bits só como hash no servidor, só no cofre nativo no Runner, nunca no IPC; revogação marcada antes da rede e repetida até confirmação; heartbeat 401 limpa o token. |
| 4 | Memória e Passport | **Verificado.** AAD com dono/projeto/revisão; CAS por revisão; consentimento revisionado na mesma instrução SQL; “esquecer” incrementa a revisão e invalida gravação concorrente; padrões de segredo recusados; promoção a `user-approved` bloqueada; TTL 1–90 dias; teto de 20 projetos; export sem autoridade. Exclusão é lógica (backups do provedor não são apagados) — documentado. |
| 5 | Scheduler e leases | **Verificado.** Claim por `UPDATE … RETURNING` com um processo por dispositivo; lease 30 s e teto 20 min; expirado vira `uncertain`, nunca volta para `queued`; DAG exige dependências anteriores; tarefa de plano só despacha com driver executável e projeto autorizado. |
| 6 | Worker | **Achado** OD2-CLAUDE-01, 04, 05, 10. CSRF: cabeçalho próprio obrigatório; `Origin: null` e subdomínios são recusados (a comparação é exata com `APP_ORIGIN`); sem CORS. Isolamento por dono em todas as consultas lidas. Erros não vazam mensagem interna (`safeReason`). SSRF do monitor: só HTTPS/443, sem credenciais, IPs privados e decimais bloqueados, redirecionamento manual. Webhook GitHub: HMAC em tempo constante, segredo ausente → 404, limite de 1 MB, dono vem da instalação registrada. |
| 7 | Segredos e criptografia | **Verificado.** `TOKEN_KEYS` versionado (AES-256-GCM, IV aleatório, AAD por finalidade), rotação lê chaves antigas; tokens OAuth cifrados em repouso; nenhum segredo em `wrangler.jsonc`/`vars`/frontend (varredura). |
| 8 | Migrações 0010–0016 | **Verificado** em SQLite descartável: aplicação passo a passo a partir do schema 0007 com dados, reaplicação idempotente, nenhuma operação destrutiva. Nenhum banco real tocado. |
| 9 | Interface e honestidade | **Verificado** por leitura e pelos testes de UI existentes; Dot e paleta idênticos à `main` (sem diff em `apps/web/src/dot/`, `dot3d/`, `assets/dot/`). |
| 10 | CI e supply chain | **Achado** OD2-CLAUDE-06. `npm audit` limpo; `cargo audit` não testado (ferramenta ausente). |
| 11 | Privacidade (árvore, histórico, remoto) | **Achado** OD2-CLAUDE-08, 11, 15. Detalhes abaixo. |

### Inventário de privacidade (área 11)

Método: varredura própria (`docs/audit/privacy-inventory.md` descreve as regras) da árvore em `HEAD` e de todas as linhas adicionadas em `git log --all -p` (176 commits, todas as refs locais), mais metadados de commits.

- **Credenciais/tokens:** nenhum valor real na árvore nem no histórico. As duas linhas que pareciam chave foram conferidas: `apps/worker/test/runner.test.ts:101` é um PEM fictício marcado `scan-secrets: teste`; `tests/secret-scan.test.ts:8` gera valores falsos em tempo de execução para testar o scanner. As atribuições no histórico são placeholders (`TOKEN_KEYS=` vazio, `"segredo-webhook"`, `"gsk_super_secreta"`, `"k"`).
- **Host de banco em `scripts/setup-cloud.ts:92`:** é um prompt com `libsql://...`, sem host real.
- **Identificadores do mantenedor:** nome e e-mail noreply nos commits (aceitos); handle/subdomínio de produção em arquivos atuais e no histórico; um caminho `/Users/[REDIGIDO]` em documento.
- **Terceiros:** nenhum dado real de terceiros. Os e-mails de teste usam domínios fictícios ou reservados, exceto alguns em domínios reais (inclusive `gmail.com`) com nomes genéricos — substituídos na árvore.
- **Imagens:** 60 imagens já versionadas em `docs/` foram abertas e conferidas uma a uma (folhas de contato): capturas do app com dados fictícios (“Bia”, `ana@example.com`, `exemplo/repo`) e artes do Dot. Nenhum e-mail real, aba de navegador, token ou caminho. Não há PDFs versionados.
- **Remoto (somente leitura via `gh`):** repositório privado; PR #1 sem comentários e sem padrões sensíveis na descrição; nenhuma issue; nenhuma release; nenhum segredo cadastrado; uma variável (`RUNNER_BUILDS_ENABLED`); nenhum environment; 14 execuções de Actions com logs baixados e varridos: só o handle (caminho do repositório) e `/Users/runner` (máquina do GitHub); 6 artefatos de instalador (`feae70d`) ainda não expirados.
- **Decisão sobre o histórico:** ver `docs/audit/CLAUDE_FINAL_REPORT.md`. Resumo: só nome, e-mail, handle e subdomínio público → **sem reescrita**; arquivos atuais corrigidos.

## Status das correções

Atualizado conforme os commits entram. SHA do commit em que a correção entrou.

| ID | Severidade | Status | Commit |
|---|---|---|---|
| OD2-CLAUDE-01 | P1 | corrigido, teste de regressão | `b0c6a6c` |
| OD2-CLAUDE-02 | P1 | corrigido, teste de regressão; ação do mantenedor antes do próximo deploy (`.deploy.local.json`) | `771ef4c` |
| OD2-CLAUDE-03 | P2 | corrigido (por origem + teto global); risco residual: botnet | `4aaff67`, `50db2d7` |
| OD2-CLAUDE-04 | P2 | corrigido | `4aaff67` |
| OD2-CLAUDE-05 | P2 | corrigido, teste de regressão | `9f623b1` |
| OD2-CLAUDE-06 | P2 | corrigido, teste de política dos workflows | `b955fbb`, `10d33be` |
| OD2-CLAUDE-07 | P2 | corrigido no código; **não compilado** (sem toolchain Rust) | `69ead54` |
| OD2-CLAUDE-08 | P2 | corrigido na árvore atual; permanece no histórico (sem reescrita, ver relatório final) | `e0b3b44`, `2927106` |
| OD2-CLAUDE-09 | P2 | corrigido (árvore, preparado, histórico, CI, hook) | `9416db1` |
| OD2-CLAUDE-10 | P3 | corrigido | `bb47638` |
| OD2-CLAUDE-11 | P3 | mitigado: publicação envia só refs explícitas | `048cee4` |
| OD2-CLAUDE-12 | P0 | corrigido: AGPL + comercial + CLA; Dot só visualização; SPDX; Marcador e prova sem o Dot. Revisão jurídica pendente | `d76826e`…`89f1917` |
| OD2-CLAUDE-13 | P3 | planejado (Windows desligado) | — |
| OD2-CLAUDE-14 | P2 | bloqueado: sem toolchain Rust; roteiro manual seção 0 | — |
| OD2-CLAUDE-15 | P1 | ação do mantenedor (produção) | — |
