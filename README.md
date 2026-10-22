# Open Dot

Assistente pessoal com agentes, rotinas remotas e o mascote **Dot**. Revisa o seu Gmail em modo **somente leitura**, acompanha sites, GitHub e Vercel, organiza um feed privado com fontes e horários e conversa com agentes de código no seu computador pelo **Runner**, sempre com a sua aprovação do conteúdo exato. Custo recorrente alvo: R$ 0 dentro das franquias gratuitas.

> **Beta.** Só o que foi validado está ligado; o resto aparece na interface como “em desenvolvimento” ou desligado. Leia as limitações abaixo antes de usar com dados reais. [English](README.en.md)

## O que funciona hoje

| Área | Estado |
|---|---|
| Login com Google, dono único (`OWNER_GOOGLE_SUB` recomendado) | Funciona |
| Gmail: revisão 08h/17h, resumo por regras, feed com fontes | Funciona, **só leitura** (nada é enviado, arquivado ou apagado) |
| Monitor de sites (HTTPS, até 3), GitHub (webhook só leitura), Vercel (leitura) | Funciona |
| Aprovações | O conteúdo exato é mostrado e aprovado; **envio continua desligado** |
| Memória de projeto e Passport | Funciona com consentimento por projeto, cifrada, com retenção; é dado, não autorização |
| Runner (desktop) + Codex | Proposta → aprovação do conteúdo exato → aplicação num worktree isolado. Validado no macOS Intel |
| Commit local de arquivos aprovados | Só com confirmação nativa separada; nunca push ou merge |

## Novo no v0.3 (beta, não publicado)

O resultado depende menos do modelo e mais da equipe e da configuração: o Dot monta a equipe certa com as ferramentas que você já tem, na sua máquina.

- **Equipe e receitas:** oito especialistas (Produto, Pesquisa, Design, Desenvolvedor, QA, Arquitetura, Segurança, Documentação) e seis receitas prontas, só dados, fixadas por hash. A tela mostra a equipe sugerida, o motivo de cada escolha e a estimativa de chamadas antes de você confirmar.
- **Aprovações:** diff, arquivos alterados, linha do tempo e o **hash real** do conteúdo mostrado; Aprovar só habilita quando o hash confere.
- **Correio e Notícias:** só leitura (remetente, assunto, trecho); resumo do dia por contagem, sem modelo; newsletters da sua própria caixa.
- **Runner companheiro:** central com abas, ícone na barra de menus com painel, saúde do computador, processos que o Runner abriu, perfis Leve/Equilibrado/Máximo e atualização assinada com consentimento. Fechado na bandeja, fica parado (0,0–0,1 % de CPU medido no Mac Intel).
- **Dot:** cor do agente ativo e reações a estado real (olhar, rubor, suor, pânico), sempre com o motivo em texto.

| Estado | O quê |
|---|---|
| **Testado** | App web e Worker (testes automáticos e de interface), Correio só leitura, Runner no Mac Intel (medido), 4 chamadas reais aos especialistas novos (Codex e Claude Code, `docs/orquestrador/AVALIACAO_REAL.md`) |
| **Sem teste real** | Claude Code no pipeline do Runner, atualização automática de ponta a ponta, Runner no Apple Silicon e no Windows |
| **Simulado** | Comparação motor × padrão simples, calibração adaptativa, ciclo revisar → corrigir, paralelismo só leitura (`docs/orquestrador/AVALIACAO.md`). Nenhum demonstrou ganho real; os três ficam **desligados** |
| **Planejado** | Análise de e-mail pelo Codex, Gemini CLI e Cursor, RSS próprio, instaladores assinados |
| **Bloqueado** | Testes do projeto em cópia isolada (sem contenção comprovada sem custo) |

A quantidade de agentes e receitas é informação, não medida de qualidade; a prova de valor são as avaliações.

## Instalar o Runner em dois passos

1. **Instale** o instalador do release e confira o hash publicado ao lado. No macOS 15 ou mais novo o instalador não é assinado pela Apple: na primeira abertura use Ajustes do Sistema → Privacidade e Segurança → **Abrir mesmo assim** (uma vez).
2. **Conecte:** o Runner mostra um código de uso único que vale por poucos minutos; confirme o código e o nome do computador na tela Runner do seu Open Dot.

Plataformas: macOS Intel **testado**; macOS Apple Silicon e Windows **sem teste real**; Linux fora do escopo. Detalhes: [`docs/release/runner-instalacao.md`](docs/release/runner-instalacao.md).

## Experimental ou desligado

- **Claude Code no Runner:** opt-in, desligado por padrão (`OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code` + ligar em Equipe).
- **Cursor e Gemini CLI:** indisponíveis até haver modo só leitura verificável no CLI instalado.
- **Desligados por padrão:** calibração, ciclo Corretor, paralelismo só leitura, sugestão de skill, pacotes importados, início com o sistema, notificações, limpeza automática, avisos de versão.
- **Nunca nesta versão:** shell e testes de projeto pelo Runner, merge/commit/push automáticos, envio, resposta ou arquivamento de e-mail.
- **IA (Groq):** opcional; e-mails privados só vão para a IA com retenção zero confirmada.

## Limitações por plataforma

- **Web/Worker:** Cloudflare Workers Free + Turso Free.
- **Instaladores não são assinados nem notarizados.** A chave de assinatura das atualizações ainda não existe (é do mantenedor); até lá, novas versões são baixadas pelo release.

## Rodar

```bash
npm install          # Node 22.13 ou mais novo
npm run dev          # http://localhost:8787  (app + API + agendador, SQLite local)
npm run check        # varredura de segredos + typecheck + testes + build
npm run test:ui      # navegador, com npm run dev rodando
npm run perf:check   # orçamento de desempenho (docs/performance)
```

Só a interface, com dados de demonstração rotulados: `npm run demo`. Para a sua instância na nuvem: [`docs/SETUP.md`](docs/SETUP.md).

## Onde está cada coisa

| Pasta | O que tem |
|---|---|
| `apps/web` | Interface React (PWA) |
| `apps/worker` | API, cron e OAuth (Cloudflare Worker) + migrações SQL |
| `apps/runner` | Runner desktop (Tauri 2 + Rust) |
| `packages/core`, `packages/connectors` | Contratos, políticas, agenda; conectores somente leitura |
| `apps/web/src/dot`, `assets/dot`, `blender` | O Dot (licença própria, ver abaixo) |
| `apps/web/src/mascot` | Fronteira do mascote: Dot (padrão) ou Marcador (forks) |
| `docs` | Setup, arquitetura, decisões, auditoria |

Arquitetura: [`docs/agents/ARCHITECTURE_MAP.md`](docs/agents/ARCHITECTURE_MAP.md). Estado: [`docs/STATUS.md`](docs/STATUS.md). Roteiro: [`ROADMAP.md`](ROADMAP.md).

## Licenças

- **Código:** [AGPL-3.0-only](LICENSE), ou [licença comercial](COMMERCIAL-LICENSE.md) para quem não quer cumprir a AGPL. Pull requests são bem-vindos para análise; o merge só acontece após revisão do mantenedor (que pode pedir apoio de uma análise de segurança e qualidade), CI verde e aceite expresso do [CLA](CLA.md) pelo autor. Ver [CONTRIBUTING.md](CONTRIBUTING.md).
- **O Dot fica visível** no app oficial e neste repositório, sob licença própria **só de visualização** ([LICENSE-DOT-ASSETS.md](LICENSE-DOT-ASSETS.md)): é permitido ver e executar o app oficial sem modificações; é **proibido copiar, redistribuir, modificar, treinar IA e uso comercial**. A AGPL não se aplica aos arquivos do Dot.
- **Quem redistribui ou faz fork deve trocar o Dot** (e o nome). O repositório traz o **Marcador**, mascote genérico sob AGPL, e `npm run check:without-dot` (também na CI) prova que o app funciona sem o Dot. Passo a passo: [`docs/FORKS.md`](docs/FORKS.md).
- **Marca:** [TRADEMARK.md](TRADEMARK.md). Atribuições: [NOTICE](NOTICE).

Os textos de licença são rascunhos e ainda passarão por revisão jurídica.

## Segurança

Vulnerabilidades: canal privado, ver [SECURITY.md](SECURITY.md). Nunca publique tokens ou dados pessoais em issues.
