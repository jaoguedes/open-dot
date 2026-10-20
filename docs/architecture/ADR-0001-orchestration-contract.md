# ADR-0001 — Orquestração incremental com ODCP

Estado: decisão técnica local para implementação incremental, 20/10/2026; capacidades externas e publicação continuam não autorizadas. Task: OD2-P0.

## Contexto

O monólito modular TS/React/Worker/Turso e o Runner Rust já funcionam no modo limitado Codex. Reiniciar a stack adicionaria risco e apagaria evidências. O protocolo anterior chamado ACP passa a ser referido como ODCP, evitando confusão com Agent Client Protocol. Não é uma alegação de que o protocolo de produto esteja concluído.

## Decisão

Manter módulos no repositório existente. Contratos versionados: ProjectBrief, MemoryEntry/MemoryLink, ExpertContract, TaskGraph, CapabilitySnapshot, EvidenceReceipt e ProjectPassport. Operações de efeito só no host; dados/proveniência não concedem permissão. Task estável, tentativa/run distinta e revision monotônica. Separar descoberta de modelos de autorização para executar.

Três camadas: memória de sessão factual temporária; ledger por projeto (SQLite/Turso quando integrado); ADRs Git. Primeira entrega: schemas, validação e operações puras, sem nova migração ou serviço. Não armazenar raciocínio privado nem credenciais. Texto externo permanece não confiável, inclusive em handoff.

Runner primeiro: reconciliar reserva/journal, provar kill/restart e preservar arquivos. Só depois controlar comandos de teste com escopo/digest, runtime e política. `npm test` não é seguro por ser teste: scripts do projeto são código arbitrário. Não abrir shell genérico.

## Alternativas

Banco/grafo externo: descartado nesta fase por instalação/custo/complexidade sem métrica. Beads: candidato real de tarefas/memória, mas sua adoção exigiria avaliar dependências, migração e fronteira de autenticação; não substituir agora o DB/ID/CAS existentes. Adaptação/export futuro possível. Task DB nativo + relações tipadas preserva stack e contratos; escolhido com custo de implementar DAG/leases e busca depois.

Fontes consultadas: [Beads](https://github.com/gastownhall/beads), [worktrees Git](https://git-scm.com/docs/git-worktree), [templates ADR](https://adr.github.io/adr-templates/). São referências de alternativas, não dependências instaladas nem evidência de suporte de provedores.

## Consequências e aceites

Concurrency permanece 1. Perfis são dados e critérios, não agentes autenticados. Passport só exporta o que foi autorizado e não concede consentimento para outro fornecedor. Aprovação remota, commit e push são escopos distintos. Scripts/UI existentes preservados; sem redesign. P0 só termina com teste de interrupção/reconciliação e revisões de segurança; P1 só termina com fluxo real conectado, não só contratos.
