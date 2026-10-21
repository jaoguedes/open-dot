# Flags verificadas das ferramentas de IA

Regra: o motor só monta comandos com flags desta tabela marcadas como **verificadas localmente** (`--help` do CLI instalado). Flag só documentada, sem CLI local, deixa o driver **indisponível** (falha fechada).

Data da verificação: 21/10/2026.

## Claude Code — verificado localmente

Versão: `2.1.296 (Claude Code)` (`claude --version`).

| Comando / flag | Uso no Open Dot | Como foi verificado |
|---|---|---|
| `claude auth status` (`--json` é o padrão) | Detecção. Código de saída 0 com login, 1 sem login. Campos observados: `loggedIn`, `authMethod`, `apiProvider`, `configDirectory`, `projectsDirectory`, `analyticsDisabled` (os dois diretórios nunca saem do Runner) | `claude auth status --help` + execução local (saída: `loggedIn: false`, `authMethod: none`, código 1) |
| `-p` / `--print` | Modo não interativo | `claude --help` |
| `--output-format json` | Envelope único `type: result` | `claude --help` + 2 chamadas reais na rodada anterior (envelope de erro) |
| `--json-schema <schema>` | Saída estruturada | `claude --help` |
| `--tools ""` | Desliga todas as ferramentas | `claude --help` |
| `--strict-mcp-config` | Ignora MCP do usuário | `claude --help` |
| `--setting-sources ""` | Ignora configurações do usuário e do projeto | `claude --help` |
| `--safe-mode` | Desliga personalizações (CLAUDE.md, hooks, plugins) | `claude --help` |
| `--disable-slash-commands` | Desliga skills | `claude --help` |
| `--no-session-persistence` | Não grava sessão | `claude --help` |
| `--permission-mode dontAsk` | Nega o que pediria permissão | `claude --help` |
| `--append-system-prompt` | Regras do modo seguro | `claude --help` |
| `--max-turns` | **Não usado**: não aparece no `--help` desta versão. O driver exige `num_turns == 1` no envelope | — |
| `--bare` | **Proibido**: exige chave de API | `claude --help` |
| `--max-budget-usd` | **Não usado**: só vale para cobrança por API | `claude --help` |

Valores de `authMethod` tratados: `claude.ai`, `oauth_token` (assinatura); `api_key`, `api_key_helper`, `third_party` (**possivelmente pago**, nunca por padrão); `none` (sem login). Qualquer outro valor: desconhecido, indisponível.

## Codex CLI — verificado localmente

Versão: `codex-cli 0.163.0-alpha.10.2`, binário dentro do app ChatGPT (`/Applications/ChatGPT.app/.../CodexCLI.app/Contents/MacOS/codex`; o Runner já procurava ali). `codex login status` → `Logged in using ChatGPT`, código 0. `codex exec --help` confirma `--json`, `--output-schema`, `-o/--output-last-message`, `--ephemeral`, `-s/--sandbox`, `--skip-git-repo-check`, `-m/--model`.

Fonte complementar: https://developers.openai.com/codex/noninteractive (lida em 21/10/2026).

| Comando / flag | O que a documentação diz | Estado |
|---|---|---|
| `codex exec` | Modo não interativo; por padrão roda em sandbox **somente leitura** | verificado (`codex exec --help`) |
| `--json` | Saída JSON Lines de eventos | documentado |
| `--output-schema <arquivo>` | Resposta final conforme um JSON Schema | documentado |
| `-o` / `--output-last-message <arquivo>` | Grava a mensagem final | documentado |
| `--ephemeral` | Não grava a sessão em disco | documentado |
| `--sandbox read-only` (padrão), `workspace-write`, `danger-full-access` | Permissões | documentado; o Open Dot só aceita o padrão somente leitura |
| `codex login status` | Não está na documentação oficial lida | verificado por execução local (código 0, `Logged in using ChatGPT`) |

O driver do Codex do Runner usa `codex app-server` com perfil de permissões somente leitura (validado com chamadas reais em rodadas anteriores). As flags de `codex exec` acima ficam registradas para o pipeline do orquestrador.

## Gemini CLI — só documentação (não instalado nesta máquina)

Fonte: repositório oficial `google-gemini/gemini-cli`, `docs/cli/cli-reference.md`, `headless.md`, `plan-mode.md` (lidos via `gh api` em 21/10/2026).

| Comando / flag | O que a documentação diz | Estado |
|---|---|---|
| `-p` / `--prompt` | Força modo não interativo | documentado |
| `-o` / `--output-format json\|stream-json` | JSON único com `response`, `stats`, `error` | documentado |
| `--approval-mode plan` | “Plan Mode” somente leitura, **mas permite `write_file` e `replace` em arquivos `.md`** | documentado; **não é somente leitura estrita** |
| `-s` / `--sandbox` | Sandbox | documentado, comportamento não verificado |
| Códigos de saída | 0 sucesso, 1 erro, 42 entrada inválida, 53 limite de turnos | documentado |
| Comando de status de login | **Não existe** na documentação lida | detecção só por chamada mínima |
| Cota gratuita | `docs/resources/quota-and-pricing.md` (último commit do arquivo: 18/06/2026): login Google (Code Assist Individual) 1.000 requisições/usuário/dia; chave de API gratuita 250/dia (só Flash); limite por minuto sem número. O README atual **não** traz mais números (60/min e 1.000/dia saíram dele) | lido em 21/10/2026 |

Consequência: Gemini **indisponível como implementador** (escreve `.md` mesmo no modo plan). Como planejador/revisor, só em cópia descartável do repositório, e só quando o CLI estiver instalado e as flags forem verificadas localmente. Nesta máquina: **indisponível**.

## Cursor (`agent`) — não instalado

Nenhuma flag verificada. Driver **indisponível**; ACP planejado.

## Ollama, OpenCode — não instalados

Catálogo marca como **planejado**.
