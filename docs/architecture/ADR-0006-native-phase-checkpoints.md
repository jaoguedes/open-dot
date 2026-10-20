# ADR-0006 — Checkpoints automáticos por fase no host

OD2-ODCP-019. O journal ativo continua sendo o recibo de recuperação; snapshots locais de fase ficam em task-checkpoints, protegidos e sem prompt, conteúdo de arquivo, token ou caminho do projeto. Mudanças de fase persistem automaticamente, com rename/fsync Unix. O snapshot registra base/HEAD/branch observados por Git somente se o worktree existe e seu ownership confere. Terminal só é registrado após ACK remoto ou reconciliação autenticada do estado terminal. Retirar journal ativo não apaga checkpoints.

Isso é adaptação nativa do ODCP, não outro scheduler. O ledger remoto CAS continua separado e ainda precisa de integração/consentimento antes de exportação ampla. O checkpoint não concede execução nem comprova testes, Git commit ou integração. Regressão de sequência, identidade divergente, registro corrompido e tentativa de reabrir terminal são recusados. Restaurar a mesma fase terminal serve somente à reconciliação já existente.

Diagnóstico IPC retorna inventário limitado a 50 entradas/8 KB por arquivo e sinaliza ilegíveis/truncamento. Desktop mostra registros reais quando o IPC fornece dados; preview web permanece indisponível. Windows nativo e durabilidade por perda de energia não comprovados. Não há limpeza automática dos snapshots/worktrees.

Gate: 17 Rust, incluindo Git/worktree reais de fixture e checkpoint após clear; SIGKILL/restart real de executor com proposta fixture passou. Nove cenários UI com API/IPC simulados passaram, incluindo inventário. Nenhuma chamada de modelo adicional nesta unidade. Commits automáticos permanecem fora do consentimento de execução atual: um checkpoint de dados não é autorização de Git.
