# Mapa da arquitetura

React/esbuild: `apps/web`; Worker e SQLite/Hrana: `apps/worker`; Tauri/Rust: `apps/runner`; contratos e políticas: `packages/core`.

Decisões canônicas: [ADRs](../architecture/), especialmente ADR-0001 (orquestração), ADR-0002 (memória) e ADR-0003 (ciclo de vida do Runner). Ledger cifrado e rotas de consentimento: `apps/worker/src/continuity`. ODCP: `packages/core/src/odcp.ts`. A existência de contrato não comprova execução operacional.
