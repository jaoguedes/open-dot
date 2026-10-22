# Arquitetura do orquestrador (v0.2 + v0.3)

```
Ideia ──► Worker: perfil (C) + seletor (E/F) ──► equipe proposta (motivos, exclusões, estimativa)
                 ▲            ▲                         │ confirmação do dono
     catálogo (A)   snapshot (B)                        ▼
                     ▲                         pipeline sequencial no Worker
          Runner: detector (tools.rs) ◄── claim ──► Runner: driver (codex/claude) só leitura
                                                        │ implementador: proposta → aprovação por hash
                                                        ▼
                                       resultados (G) → cota, calibração (só registro)
```

| Parte | Onde | Estado v0.2 |
|---|---|---|
| A. Catálogo | `orchestrator/catalog/ferramentas.json`, `packages/core/src/orchestrator/catalog.ts` | feito: fato = valor + fonte + data; desconhecido = null |
| B. Detector | `apps/runner/src-tauri/src/tools.rs`; parsers TS em `detection.ts`; `POST /api/runner/device/tools` | feito; só comandos públicos dos CLIs |
| C. Perfil | `profile.ts` | heurística por palavras, explicada |
| D. Agentes | `agents/<id>/`, `agents.ts`, `scripts/orchestrator/build-agents.ts` | formato, carregador e 5 especialistas |
| E/F. Seletor | `selector.ts`, `orchestrator/config/pesos.json`, `POST /api/orchestrator/team` | restrições duras, pontuação neutra, explicação, troca manual |
| Cota | `quota.ts`, `od_tool_quota`, `PUT /api/orchestrator/quota/:tool` | contador diário, limite do usuário, limite aprendido por erro |
| Pipeline | `apps/worker/src/orchestrator/pipeline.ts`, `executor.rs`, `codex.rs`/`claude.rs` (`respond`) | sequencial; papéis só leitura validados por esquema; implementador com aprovação exata |
| G. Calibração | `calibration.ts`, `od_orchestrator_calibration`, `GET/POST /api/orchestrator/calibration` | v0.3: ajuste conservador por (papel, ferramenta, tipo), mínimo 8 resultados, encolhimento, passo ≤ 0,05/dia, 0,75–1,25; **desligada por padrão** |
| H. Atualização do catálogo | `catalog-propose.ts`, `orchestrator/catalog/fontes.json`, `npm run catalog:propose` | v0.3: só proposta em `orchestrator/catalog/propostas/`; aplicação humana |
| Receitas | `recipes.ts`, `orchestrator/recipes/*.json` (lock por hash), `GET /api/orchestrator/recipes` | v0.3: só dados; recusa chave de poder em qualquer nível |
| Ciclo Corretor | `review-loop.ts`, `pipeline.ts` (`maybeLoop`) | v0.3: até N rodadas, para sem progresso/cota/achados; **desligado** |
| Sugestão de skill | `skill-suggest.ts`, `od_skill_proposals`, `/api/orchestrator/skills` | v0.3: só sinais estruturados do dono; rascunhos fixos; aprovação por hash; **desligada** |
| Pacotes locais | `package-import.ts` (navegador), `package-validate.ts` (servidor), `od_agent_imports` | v0.3: só dados, entram desligados |
| Paralelismo só leitura | `parallel.ts` | v0.3: planejador de lotes ≤ 2, só leitura; **desligado, simulado** |
| Testes em cópia isolada | `sandbox.ts`, `apps/runner/src-tauri/src/sandbox.rs` | v0.3: contrato + implementação indisponível; **bloqueado** |

Migrações: `0018_orchestrator.sql` (v0.2) e `0019_orchestrator_v03.sql` (v0.3: preferências, calibração, pacotes importados, propostas de skill). Só expansão; **nenhuma aplicada em produção**.

Segurança: pacotes de agentes são dados (sem permissões); saídas anteriores entram no prompt como dados delimitados; regras do host vêm depois do perfil; saídas só leitura passam por `checkSchema` (palavra-chave desconhecida falha fechado); sem shell, testes ou paralelismo.
