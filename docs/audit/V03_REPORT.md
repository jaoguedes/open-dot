# Relatório do v0.3 — agentes, redesign e Runner companheiro (22/10/2026)

Nada publicado: sem push, merge na `main`, tag, release, deploy, migração remota, workflow disparado ou mudança de visibilidade.

## SHAs

| Ref | SHA |
|---|---|
| Base (`release/v0.2`) | `69c5769226319a33f79c7f3e6419bc98afd92611` |
| `claude/od2-v03` | este relatório entra num commit depois de `6ac36a0`; confira com `git rev-parse claude/od2-v03` (um arquivo não pode conter o SHA do próprio commit) |

## O que foi feito, por fase

| Fase | Entrega |
|---|---|
| 0 | Branch no SHA exigido; linha de base (394 Node, 7 Python, 356 KB); medição de desempenho do Runner e do app (`docs/performance/BASE_V03.md`); referência visual do Runner copiada (a do app não existia: decisão registrada). |
| 1 | `tint` do agente e reações (`gaze`, `heat`, `strain`) no motor do Dot com golden byte a byte; tokens, Plus Jakarta Sans local, componentes base, `docs/DESIGN.md`; D-027 e D-028 com `CLAUDE.md` e `.cursor/rules` juntos. |
| 3 | Arquitetura, Segurança e Documentação; calibração adaptativa; ciclo Corretor; 6 receitas; sugestão de skill; migração `0019`; golden com 28 casos. |
| 2 | Trilho recolhido de 84 px (hover, foco, botão, Esc, clique fora, fixar), barra inferior de 4 itens, topo com chip de demonstração e busca. |
| 4 | Workspace, Central do Runner, Aprovações (hash real), Conexões, Equipe (especialistas, receitas, ajustes, sugestões); mobile do 1º cartão. |
| 4B | Runner 0.3.0: central com abas, bandeja + painel, saúde e proteção com histerese, processos próprios, perfis e recuo, prioridade baixa, `--oculto`, atualização assinada com consentimento, docs de release, `perf:check`. |
| 5 | Correio e Notícias só leitura: rota de leitura, resumo por contagem, prova de que o texto do e-mail não vira instrução, Correio sem ferramenta de rascunho. |
| 6 | Proposta de catálogo (H); pacotes locais; sandbox (contrato, bloqueado); paralelismo só leitura (desligado, simulado). |
| 7 | Página pública honesta; `ui:widths` (360–1440 px). |
| 8 | 4 chamadas reais; READMEs, ROADMAP, CHANGELOG, notas, docs do orquestrador, este relatório. |

30 commits em `claude/od2-v03` antes deste relatório.

## Estado honesto

| Item | Estado |
|---|---|
| App web, Worker, telas novas (demonstração e modo real local) | **testado** |
| Correio e Notícias só leitura | **testado** (rota, filtros, injeção, ausência de escrita do Gmail) |
| Dot `tint` e reações | **testado** (golden byte a byte sem parâmetros; reações por estado medido) |
| Runner no macOS Intel (abrir, central, oculto, medir) | **testado** nesta máquina |
| Bandeja e painel no macOS | **testado** em interface simulada (IPC) e compilado; clique real no ícone da barra **sem teste real automatizado** |
| Painel da bandeja no Windows e no ARM64 | **sem teste real** |
| Temperatura | **indisponível** nesta máquina (sem leitura sem privilégio); bateria e limite térmico pelo `pmset` (macOS); Windows: bateria e térmico **indisponíveis** nesta versão |
| Atualização real ponta a ponta | **sem teste real** (falta a chave do João e duas versões publicadas) |
| Pareamento por código | já era código de uso único com validade; **mantido** (o código curto de 6 dígitos mudaria a autenticação: proposta no ROADMAP) |
| Codex nos especialistas novos | **testado**, 2 chamadas reais |
| Claude Code nos especialistas novos | **testado**, 2 chamadas reais (agora logado por assinatura) |
| Claude Code no pipeline do Runner | **sem teste real** (driver opt-in, desligado) |
| Gemini CLI, Cursor | **indisponível** (não instalados) |
| Calibração adaptativa | **simulado**, desligada |
| Ciclo Corretor | **simulado** (e testado ponta a ponta com Runner simulado), desligado |
| Receitas | **testado** (carregador, rotas, golden 12/12) |
| Sugestão de skill | **testado** com sinais sintéticos; desligada |
| Pacotes da comunidade | **testado** (importação, recusa de maliciosos) |
| Paralelismo só leitura | **simulado**, desligado |
| Testes em cópia isolada | **bloqueado** |
| Análise de e-mail pelo Codex | **planejado** (botão mostra conteúdo e hash, envio desligado) |
| Instalação em dois passos (README e página) | **testado** como texto; instalação real do 0.3.0 **sem teste real** |
| Windows / ARM64 | **sem teste real** |

## Gate

| Verificação | Resultado |
|---|---|
| `npm run check` | **PASS** — 442 testes Node, 0 falhas; 7 Python; `eval:correio`; typecheck; build (primeira tela 365,0 KB, aviso acima da meta 350, abaixo do teto 400) |
| `npm run check:without-dot` | **PASS** — 414 testes, 412 passam, 0 falhas; builds web e Runner; bundle sem desenho do Dot |
| `cargo test --locked` | **PASS** — 53 passam, 8 ignorados (rede/modelo); antes 34 |
| `npm run test:ui` (`npm run dev`, banco descartável limpo) | **107/107** |
| `npm run ui:runner` | **14/14** (8 web + 6 Runner, inclui axe) |
| `ui:fase-a/d/e/f/g`, `ui:rodada4` | **PASS** (12, 11, 5, 2, 4, 2) depois de adaptar 3 roteiros à casca nova |
| `npm run ui:mobile` (360, 390 e 430 px) | **PASS** — 16 verificações em cada largura. **Não tinha rodado antes do primeiro deploy** (só o `test:ui`): o deploy parou nele com "Copiar detalhes" coberto pela caixa de perguntas em Código e Sentinela. Causa: o topo quebrava em duas linhas (a data seguia visível por especificidade), empurrando o conteúdo 45 px para baixo da caixa. Corrigido em `shell.css` (topo numa linha, data oculta, coluna da grade com `min-width: 0`); o teste não foi afrouxado — só ganhou `UI_WIDTH` e o tamanho da busca passou a ser relativo à largura da tela (idêntico em 390) |
| `ui:fase-d` D1 (paleta) | **PASS** depois de correção. Intermitente (≈1 em 3, já em `b4ffe60`): se a paleta abria antes do módulo pré-carregado, a re-renderização seguinte trocava o componente `lazy` pelo carregado e a paleta remontava, apagando o que foi digitado. Barrou duas tentativas de deploy (nada publicado). Corrigido em `App.tsx` (`PaletteHost` fixa o componente por abertura); 12/12 depois |
| `npm run ui:clearance` (novo) | **PASS** — em 360/390/430 px, nas 15 rotas (Código, Sentinela, Correio, Notícias, Equipe, Aprovações, Correio, Runner, Conexões e demais), o último controle e "Copiar detalhes" ficam acima da barra inferior e da caixa de perguntas depois de rolar até o fim |
| `npm run ui:widths` | **PASS** — sem rolagem horizontal em 360/390/430/768/1024/1440 nas 13 rotas; 1º cartão 663 px a 390 px |
| axe | sem achados sérios nas telas novas e antigas, claro e escuro, 390/768/1440 (scripts acima) |
| `npm run perf:check` | **PASS** — oculto 0,1 % CPU / 196 MB; central Leve 36,9 % / 225 MB; JS do Runner 301 KB |
| `cargo audit` (CI `rust-audit`, não obrigatório) | **FALHA residual**: avisos RustSec publicados entre 09 e 21/10/2026. `rustls-webpki` 0.103.16 e `tokio` 1.54.1 corrigidos no lockfile. Restam `zip` 4.6.1 (RUSTSEC-2026-0367/0369: extração com permissões/SUID), puxado só pelo `tauri-plugin-updater` 2.14.0 — o estável mais novo; a correção (`zip` ≥ 9) só existe na 3.0 alfa — e `proc-macro-error` (Linux/GTK). Mitigação: o updater só extrai pacote com assinatura válida e está inerte enquanto a chave pública for provisória. Não silenciado no audit |
| `npm audit` | 0 vulnerabilidades |
| Varredura de segredos (árvore) | limpa (843 arquivos) |
| Varredura de histórico (`scan:history`) | o ID de rollback saiu do histórico da branch (reescrita autorizada); demais achados vêm de commits anteriores à rodada |
| SPDX | PASS |
| Continuidade (`check-continuity`) | **FALHA de formato**: 28 commits com trailer `Task: v0.3 fase N` em vez de `Task: OD2-…` (2 também com escopo `v0.3`); corrigido a partir de `4328528`. Histórico não reescrito |
| Lint | 0 erros; 1 aviso preexistente (`DotView`, dependências do efeito) |

## Comparativos (todos simulados; real só em `AVALIACAO_REAL.md`)

- **Motor × padrão simples:** perfil 15/16, papéis 16/16 vs 8/16, revisor independente 16/16, login pago 0/16; 3,63 vs 2,00 chamadas. Qualidade não medida.
- **Calibração ligada × desligada:** 60 % → 80 % de aprovação esperada **só** no mundo sintético com diferença real e amostra suficiente; com ferramentas iguais ou poucos dados, nada muda. **Não demonstra ganho real → desligada por padrão.**
- **Ciclo com × sem:** achados restantes 2,50 → 1,08 (1 rodada) → 0,66 (2 rodadas), a 1,00 → 3,00 → 3,99 chamadas, num modelo de correção inventado. **Não demonstra ganho real → desligado por padrão.**
- **Real:** 4/4 saídas válidas no esquema; Segurança reprovou a injeção no Codex e no Claude Code.

## Tamanho dos 8 especialistas (AGENT.md)

Pesquisa 3,9 KB · Desenvolvedor 4,0 KB · Design 4,2 KB · QA 4,6 KB · Produto 5,5 KB · Documentação 5,7 KB · Arquitetura 6,1 KB · Segurança 6,3 KB (cada um com rubrica, esquema e 3 evals).

## Flags verificadas

`docs/orquestrador/FLAGS_VERIFICADAS.md`: Codex 0.163.0-alpha.11 e Claude Code 2.1.306 reverificados por `--help` local em 22/10/2026 (`--bare` continua proibido); Gemini e Cursor não instalados.

## Desempenho (Mac Intel do João; Windows e Apple Silicon sem teste real)

| Medida | Antes | Depois |
|---|---|---|
| Runner, janela aberta | 120,7 % CPU (assistente, 60 qps) | 36,9–37,5 % (central, Leve 10 qps); 85,7 % no assistente |
| Runner oculto na bandeja | não existia | 0,0–0,1 % CPU, 196 MB |
| Consulta à fila | 2 s fixos | 5→60 s com recuo (Leve), dobro oculto |
| App web, CPU em repouso (390–1440) | 3,2–7,2 % | 2,5–10,6 % (Workspace novo tem mais Dots) |
| Primeira tela | 356,0 KB | 365,0 KB |

Não declaro “leve em qualquer máquina”: só esta máquina foi medida.

## Telas implementadas × referência

- **Runner (referência existe):** Hoje, Saúde, Processos, Atualizações e painel seguem a referência; diferenças: Dot do Runner a 10 qps no perfil Leve (a referência citava 30); “Aguardando você” e “Na fila” vêm só do journal local (a fila está no servidor), então “Na fila” virou “Pastas autorizadas”; pareamento continua com o código atual (a referência mostra 6 dígitos).
- **App (referência das 8 telas ausente):** feito pelas descrições do prompt e pela linguagem da referência do Runner.
- **Mobile:** 1º cartão 1.748 → 663 px a 390 px; nada transborda de 360 a 1440 px.

## O que depende do João

1. ~~Decidir sobre o commit `613b607`~~ resolvido: removido do histórico local, com backup local que não pode ser enviado.
2. Gerar a chave de assinatura do updater e decidir a exceção de política para o secret no CI (`docs/release/runner-chave-de-assinatura.md`).
3. Aplicar a migração `0019` em produção antes do código novo (ver checklist).
4. Validar à mão o Runner 0.3.0 (bandeja, painel, atualização com duas versões) e, se quiser, Windows/ARM64.
5. Revisão jurídica, contato, origem de ícones (pendências do v0.2 continuam).

## Riscos abertos

- Qualidade dos especialistas sem medida em escala (4 chamadas reais são evidência de funcionamento).
- Janela aberta do Runner ainda custa ~37 % de CPU nesta máquina (Dot com desfoques SVG no WebKit).
- Atualização automática nunca exercitada de verdade; comportamento do Gatekeeper após atualizar sem Developer ID desconhecido.
- `REQUIRED_SCHEMA` passou a `0019`: Worker novo com banco sem a migração fica com saúde degradada (o padrão do projeto aceita banco mais novo, não mais velho).
- Commits da rodada fora do formato de trailer da política (só formato; conteúdo e mensagens Conventional Commits).

## Desvios deste prompt

- **ID de rollback:** o prompt mandava comitar a mudança local do `STATUS.md`, o que levou o ID sem redação para o commit `613b607`. Na publicação o João autorizou reescrever só a branch local: o commit saiu do histórico.
- **Verde de Aprovar** `#1C834E` em vez de `#1F8F55` (AA).
- **Tetos de quadros** Leve 10 / Equilibrado 24 (a referência dizia 30 no Leve).
- **CI sem secrets:** o build do CI desliga os artefatos do updater; assinatura no CI fica para decisão do João.
- **Análise de e-mail pelo Codex:** entregue só a prévia do conteúdo e do hash; envio planejado.
- **Pareamento por código curto:** mantido o fluxo atual (já é código de uso único).
- **Trailer dos commits** fora do formato até `4328528`.
- **Notificações:** só “aprovação pendente” implementada; “tarefa concluída”, “erro” e “atualização disponível” ficaram planejadas.
