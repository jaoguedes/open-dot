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

## Experimental ou desligado

- **Claude Code no Runner:** driver implementado no modo somente-proposta, **não validado com o CLI real**; desligado salvo opt-in (`OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code`).
- **Cursor no Runner:** indisponível (o CLI não permite desligar ferramentas de escrita e shell de forma verificável).
- **Desligados nesta beta:** shell e testes de projeto pelo Runner, paralelismo entre agentes, merge, commit ou push automáticos, envio de e-mail, Web Push, executor no Windows.
- **IA (Groq):** opcional; e-mails privados só vão para a IA com retenção zero confirmada.

## Limitações por plataforma

- **Web/Worker:** Cloudflare Workers Free + Turso Free.
- **Runner:** macOS Intel testado; macOS ARM64 e Windows só compilados em CI, sem validação nativa recente. Executor desligado no Windows.
- **Instaladores não são assinados nem notarizados.** O sistema vai avisar; confira o checksum publicado junto com o instalador.

## Rodar

```bash
npm install          # Node 22.13 ou mais novo
npm run dev          # http://localhost:8787  (app + API + agendador, SQLite local)
npm run check        # varredura de segredos + typecheck + testes + build
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

- **Código:** [AGPL-3.0-only](LICENSE), ou [licença comercial](COMMERCIAL-LICENSE.md) para quem não quer cumprir a AGPL. Contribuições exigem o [CLA](CLA.md).
- **O Dot fica visível** no app oficial e neste repositório, sob licença própria **só de visualização** ([LICENSE-DOT-ASSETS.md](LICENSE-DOT-ASSETS.md)): é permitido ver e executar o app oficial sem modificações; é **proibido copiar, redistribuir, modificar, treinar IA e uso comercial**. A AGPL não se aplica aos arquivos do Dot.
- **Quem redistribui ou faz fork deve trocar o Dot** (e o nome). O repositório traz o **Marcador**, mascote genérico sob AGPL, e `npm run check:without-dot` (também na CI) prova que o app funciona sem o Dot. Passo a passo: [`docs/FORKS.md`](docs/FORKS.md).
- **Marca:** [TRADEMARK.md](TRADEMARK.md). Atribuições: [NOTICE](NOTICE).

Os textos de licença são rascunhos e ainda passarão por revisão jurídica.

## Segurança

Vulnerabilidades: canal privado, ver [SECURITY.md](SECURITY.md). Nunca publique tokens ou dados pessoais em issues.
