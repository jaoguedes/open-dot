# Open Dot

Assistente pessoal com agentes, rotinas remotas e o mascote Dot. Revisa seu Gmail às 08h e 17h (America/Sao_Paulo), acompanha seus sites, GitHub e Vercel e publica um feed privado com fontes, horários e cobertura. A IA é opcional e remota. Custo recorrente alvo: R$ 0 dentro das franquias gratuitas.

> Nome provisório: já existe `composio-community/open-dot`.

## Open Dot 2.0 — remediação local, não publicada

Runner limitado do Codex e aprovação de conteúdo possuem testes reais no Mac Intel. A rodada atual adiciona reconciliação/cancelamento honesto, negociação de protocolo e memória cifrada com consentimento no Workspace. Não é a conclusão de todo o produto 2.0; shell/testes de projeto, Claude/Cursor e automação multiagente continuam indisponíveis. Instaladores anteriores não contêm as correções locais.

Leia [relatório técnico](docs/audit/REMEDIATION_REPORT.md), [continuidade](docs/AGENT_HANDOFF.md) e [segurança](SECURITY.md) antes de executar/migrar. Nenhum deploy, release, licença open source definitiva ou exposição pública foi autorizado.

## Rodar em 3 comandos

```bash
npm install          # Node 22.13 ou mais novo
npm run dev          # http://localhost:8787  (app + API + agendador, SQLite local)
npm run check        # typecheck + testes + build
```

Para ver só a interface com dados de exemplo, rode `npm run demo`.

## Onde está cada coisa

| Pasta | O que tem |
|---|---|
| `apps/web` | Interface React (esbuild), Inter local, temas claro e escuro, Dot 2D de fallback |
| `apps/worker` | API, cron e OAuth (Cloudflare Worker) + migrações SQL |
| `packages/core` | Contratos, estados, resolvedor visual, roteador de IA, políticas e agenda |
| `packages/connectors` | Google/Gmail (leitura), GitHub, Vercel, verificação HTTP |
| `blender` | Pipeline do Dot 3D: build, exportação GLB, validação e manifesto |
| `assets/dot` | GLBs publicados e manifesto (gerados pelo pipeline) |
| `infra` | Implantação (Cloudflare + Turso) |
| `docs` | Status, revisão do PDF, decisões, guia para o Cursor e o que depende do João |
| `tests` | Testes que cruzam componentes |

Comece por [`docs/COMECE_AQUI_CURSOR.md`](docs/COMECE_AQUI_CURSOR.md) e [`docs/STATUS.md`](docs/STATUS.md).
