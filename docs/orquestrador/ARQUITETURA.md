# Arquitetura do orquestrador (v0.2)

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
| G. Calibração | `od_orchestrator_outcomes`, `GET /api/orchestrator/outcomes` | só registro (peso 0) |
| H. Atualização do catálogo | — | planejado (v0.3) |

Migração nova: `0018_orchestrator.sql` (só expansão; **não aplicada em produção**).

Segurança: pacotes de agentes são dados (sem permissões); saídas anteriores entram no prompt como dados delimitados; regras do host vêm depois do perfil; saídas só leitura passam por `checkSchema` (palavra-chave desconhecida falha fechado); sem shell, testes ou paralelismo.
