# Revisão independente da remediação — próxima ação

Mantenedor informou auditoria Cursor; os dois originais não foram encontrados e não foram modificados. IDs/severidades do resumo foram revalidados pelo executor, sem atribuir-lhe auditoria independente. Fonte atual c7b2426, branch codex/od2-runner-remediation. Ler REMEDIATION_REPORT, REMEDIATION_RUN, ENGINEERING_STATE e ADR-0003 antes dos arquivos históricos abaixo.

Claude Code: revisar diffs por commit desde 2b7d5c5; priorizar lease/cancelamento/uncertain, CAS de eventos e aprovação, shadow/stale reads (D3), ownership/cleanup e proposta beforeContent (D2). Tentar reproduzir casos antes/depois. Auditar memória HTTP: owner do auth, guard SQL de consentRevision, corrida com forget, retenção/renovação sem ressuscitar snapshot e exclusão de conta. Confirmar que nenhuma memória/perfil concede execução. Não considerar testes ou esta revisão interna como autorização para rollout.

Reproduzir check, Rust, UI, recovery e memória-browser. Teste Codex real só quando outra alteração justificar chamada; ensaio anterior já passou. GUI nativa completa, crash durante geração, iPhone/ARM64/Windows, isolamento de comandos, coordenação Git e auditoria histórica de privacidade/licenças permanecem pendentes. Não publicar, enviar mensagens, migrar produção ou habilitar APIs pagas.

Após revisão: Cursor pode refinar fluxos preservando Dot, paleta e estados honestos; resolver primeiro achados de segurança. Nenhum merge/main/push recebe autorização por este documento.

---

## Plano histórico preservado

# Pacote para Claude Code e Cursor — auditoria independente

Task: OD2-AUDIT. Revisão ainda não realizada. Não afirmar aprovação porque o executor escreveu este arquivo. Preservar branch/worktree/arquivos; não assumir acesso a provedores, autorização de push ou execução de comandos de projeto.

## Claude Code — ordem recomendada

1. Ler AGENT_HANDOFF, BASELINE, RISK_REGISTER, FEATURE_MATRIX, ADR-0001/0002 e IMPLEMENTATION_REPORT. Conferir Git real contra `9e33c3b`, sem reset/rebase/force push.
2. Auditar `apps/worker/src/runner/routes.ts` e `apps/runner/src-tauri/src/executor.rs`: estado remoto/journal, task/device scope, sequência/dedup, limite de eventos, cancelamento/revogação e aprovação sem replay. Priorizar inconsistências, não estilo.
3. Auditar `recovery_tests.rs`: o kill é real, mas a proposta é fixture e a primeira escrita usa rotina real em um subconjunto aprovado. Teste não é crash do Codex nem GUI completa. Tentar outros limites e legado seq=500; não marcar esses casos como resolvidos pelo teste atual.
4. Auditar memória: `project-memory.ts` do core e do Worker, migração 0009 e testes. Conferir CAS concorrente, AAD, isolamento, promoção humana bloqueada, tamanho/ciclos e falta de boundary HTTP/auth próprio. Não expor serviço sem desenhar auth/consentimento.
5. ODCP/Expert: contratos não são permissões ou prova de Git. Validar paths/SHAs, estado dirty, tarefa/run distintos, interseção de ferramentas e revisão independente para alto risco. Timer puro não é scheduler de produto.
6. Registrar achados por severidade, arquivo/linha, reprodução, efeito e recomendação mínima. Separar corrigido, mitigado e pendente. Nenhuma tentativa ofensiva externa.

Comandos locais: `npm run check`, `npm run lint`, `cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml`, `node --import tsx scripts/check-continuity.ts --base 9e33c3bb44844e8d821a3664db8f4aae9f448878`. Recuperação real: `node --import tsx scripts/test-runner-channel.ts --recovery`, com Rust/cofre/loopback disponíveis. Teste Codex real só se uma mudança justificar outra chamada e houver login oficial; não solicitar token no chat. Logs/prints não devem incluir dados de contas ou caminhos identificáveis.

## Cursor — após a auditoria

Ler os achados, revalidar o HEAD e trabalhar em unidade isolada com checkpoint e trailer Task. Integrar contratos ao fluxo existente antes de adicionar telas; preservar corpo/olhos/blush/animações e paleta. Qualquer elemento sem driver real deve dizer indisponível. Não habilitar shell/testes genéricos nem promover um perfil a autorização. Receber contexto por Git+ledger/handoff, nunca copiar cache de credenciais.

## Aceite da revisão

Relatório independente com SHAs realmente auditados, comandos executados, casos não testados e riscos residuais. Uma revisão manual ou de CLI indisponível fica pendente. Não enviar mensagens a outros agentes/serviços nem fazer push/release sem autorização específica do mantenedor.
