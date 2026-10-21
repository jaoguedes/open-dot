# Plano do v0.2 — motor de orquestração

Branch `claude/od2-v02` a partir de `claude/od2-audit` (`d9fe92d`). Nada é publicado; integração só local em `integration/v0.2-candidate`.

## Ordem

1. **Catálogo e detector (A, B):** catálogo versionado em `orchestrator/catalog/` com fonte e data por fato (desconhecido = `null`); parsers de detecção puros em `packages/core/src/orchestrator/` testados com fixtures; detector no Runner; snapshot sem credenciais enviado pelo heartbeat autenticado; migração `0018`.
2. **Agentes (D):** formato `agents/<id>/` (AGENT.md, rubrica, schema, evals), carregador que trata pacotes como dados não confiáveis, cinco especialistas densos (Produto, Pesquisa, Design, Desenvolvedor, QA).
3. **Seletor (C, E, F):** perfil do projeto por heurística, pontuação explicável com restrições duras, modo uma-ferramenta, estimativa de chamadas, endpoint “montar equipe”.
4. **Drivers e pipeline:** interface comum; Codex e Claude Code proposta-apenas; Gemini e Cursor indisponíveis se as flags não forem verificadas localmente; pipeline sequencial com aprovação por hash exato.
5. **Calibração e avaliação (G):** registro de resultados; `evals/golden/` com ≥ 10 tarefas; comparação motor × padrão simples com drivers simulados (rotulado).
6. **Tela Equipe:** ferramentas detectadas, plano/cota, equipe proposta com motivos, troca manual, aviso do Claude opt-in.
7. **Integração e relatório:** merge local de `claude/od2-ui`, gate completo, `V02_REPORT.md`, `PUBLISH_READINESS.md`.

## Fora do v0.2

Execução de shell ou testes pelos agentes, paralelismo de código, merge/commit/push automáticos, raspagem de sites, leitura de credenciais, ACP obrigatório, atualização automática do catálogo (H), qualquer recurso pago, mudança no Dot.
