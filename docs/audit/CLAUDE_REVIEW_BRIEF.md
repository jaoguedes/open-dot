# Brief vigente para auditoria independente — Claude Code

Localizar worktree `open-dot-od2-remediation` via Git, branch `codex/od2-runner-remediation`. Último código 48e3a15; conferir SHA completo/HEAD documental e status. Não editar este worktree simultaneamente; criar checkout próprio do HEAD correto. Remoto não contém necessariamente esses commits e push exige autorização específica.

Ler AGENTS/CLAUDE, PROJECT_STATE, FINAL_IMPLEMENTATION_REPORT e REMEDIATION_RUN. Questionar as conclusões do Codex. Auditorias originais Cursor ausentes; resumo não substitui originais. Priorizar:

1. Cancel/revoke/lease/event receipts/CAS e resultados tardios; nunca aceitar HTTP200 como prova de persistência.
2. Scheduler: concorrência, tentativa única, fase/dependência, pause/revoke, recibos incompletos e uncertain sem retry. Tarefas usam bases independentes; sem integração automática.
3. Git checkpoint: ownership, índice temporário, hooks/filtros, arquivos alheios, CAS ref, morte antes/depois do commit e recuperação do mesmo SHA. Consentimento de arquivos não é consentimento de commit/push.
4. Memória: escopo/CSRF/consentimento revisionado/forget race, limite de retries do bridge, edição com proveniência e revisão antiga. Passport não transfere privilégios nem executa conteúdo.
5. Exportação: campos privados, bounds, arquivo nativo não confiável, identidade entre hosts, snapshot SQL, revogação durante leitura e exclusão de prompts por padrão. Diálogo Tauri não foi operado.
6. Negociação: Worker antigo recebe driver antigo; features contraditórias/versões desconhecidas recusadas; catálogo de modelos não descoberto. Status Claude precisa sucesso+JSON.
7. Perfis: prompt congelado não prova cumprimento; qualityGate not-attested deve sobreviver a completed. Nenhuma ferramenta/autoridade advém do contrato.
8. Crash durante geração real e GUI Tauri continuam lacunas; comandos de projeto/paralelo permanecem desabilitados. Revalidar SO/instaladores atuais antes de beta.

Comandos: npm run check; npm run lint; cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml; node --import tsx scripts/test-runner-browser.ts --plans-only; node --import tsx scripts/test-runner-channel.ts --recovery; node --import tsx scripts/check-continuity.ts --base 940b06c60138af8ebdf8a0291732f36cd21ea6de.
Sem --plans-only/--memory-only, browser pode chamar Codex real: não repetir sem necessidade/autenticação oficial. Logs locais listados no relatório; fixtures não são prova de modelo ou UI nativa. Registrar achados em área Claude/handoff próprio. Sem push/release/deploy/migração remota ou gastos.
