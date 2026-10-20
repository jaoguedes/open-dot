# Resultado operacional — 20/10/2026

O critério de uma tarefa real foi atingido no núcleo nativo do Runner com Codex autenticado. A entrega permanece limitada e não representa validação completa do aplicativo em todas as plataformas.

## Fluxo real comprovado

`node --import tsx scripts/test-runner-channel.ts --codex`, com Rust no PATH, passou em 20/10/2026. Usa CLI oficial instalado, login ChatGPT existente, Keychain real, HTTP/SQLite locais isolados e uma chamada real do modelo. O teste autoriza somente um arquivo fixo e inofensivo: `RUNNER_RESULT.md`. Comprova ausência de escrita antes da aprovação, rejeição de hash incorreto, aplicação do conteúdo aprovado no worktree, eventos de conclusão e pasta original limpa. Nenhuma credencial sai para o frontend; o segredo de pareamento de teste é removido.

Evidência local desta rodada: `/var/folders/gk/nf_010s54_l5m7758dld0j_c0000gn/T/open-dot-real-codex-74163`. Log: `/private/tmp/open-dot-real-codex-oct20.log`.

Não cobre login Google, cliques no seletor/tray, instalação gráfica ou o fluxo inteiro pela interface. A autorização de pasta e aprovação são programáticas no teste, com o mesmo núcleo HTTP/nativo usado pelo produto.

## Funcionalidades operacionais

- Pareamento com código temporário de uso único, prova de posse, autenticação web/CSRF, cofre nativo, recuperação do vínculo, heartbeat e revogação. Só conexões de saída; HTTP loopback apenas debug.
- Fila com reserva atômica, idempotência, eventos e propostas cifrados, autorização por dono/dispositivo/projeto e aprovação por hash com expiração/uso único.
- Codex no macOS: perfil oficial nomeado com leitura restrita, prova com canários antes de executar, MCP/plugins/ferramentas desabilitados e conta ChatGPT obrigatória, sem fallback pago. Contrato experimental validado em runtime; incompatibilidade bloqueia o driver.
- Worktree de HEAD sem executar hooks/filtros; credenciais e symlinks não materializados. Proposta até oito arquivos/8 KB; aplicação fixa pelo host somente após aprovação do conteúdo exato. Proteção contra caminhos externos, symlinks e versão inicial alterada.
- Limites de saída/tempo/recursos e árvore de processos no macOS. Journal guarda só metadados, sem prompt, resposta ou token. Recupera propostas confirmadas sem repetir modelo e permite reaplicação idempotente dos arquivos já aprovados.
- Workspace com projeto, mecanismo, prompt, tarefas, eventos, conteúdo completo e aprovação/rejeição; presença do Dot original e paleta preservadas.

## Limitações explícitas

Shell e testes de projeto estão desabilitados. O evento de testes informa “não executados”; os testes automatizados do Open Dot não são resultados do projeto escolhido. Não há merge, commit, push ou deploy automático do projeto. Contexto enviado ao modelo é parcial (até 16 arquivos, 24 KB), com filtros adicionais que não equivalem a DLP. Snapshot limitado a 32 MB/5000 arquivos; alterações não commitadas da pasta original não são incluídas.

Claude Code instalado sem login; driver de execução não implementado. Cursor CLI ausente; driver de execução não implementado. Executor Windows permanece bloqueado até prova nativa de isolamento/árvore de processos. Autostart, comandos/testes autorizáveis, diffs completos, limpeza/expurgo de longo prazo e recuperação integrada após encerramento abrupto continuam pendentes. Interromper não desfaz arquivos já aprovados/aplicados.

## Validação e distribuição

Check completo PASS: 279 testes Node, avaliação sintética Correio, sete testes Python, typecheck/build. Lint sem erros (um aviso preexistente DotView). Seis cenários anteriores de UI passaram; W5 de aprovação passou separadamente. Dez unitários Rust passaram, incluindo retomada de escrita parcial; dois testes nativos ignorados por padrão. Varredura de 448 arquivos rastreados e novos: zero segredos. DMG Intel debug de 12,11 MiB gerado e checksum hdiutil VALID; SHA-256 no guia de instaladores. Testes Chromium usam API/IPC simulados, identificados como tal. O teste Codex acima não usa mecanismo simulado.

Sem release/deploy, conforme pedido atual. GitHub autenticado e orçamento zero com bloqueio confirmados pelo João. Matriz Actions preparada para Intel, ARM64 e Windows; execução/artefatos devem ser registrados depois de efetivamente obtidos. Sem assinatura/notarização e sem exigir Xcode completo. Nenhuma migração remota aplicada; backend de produção ainda precisa do processo aprovado de migração `0008`.

Checkpoint de distribuição: CI geral PASS; Runner verify PASS e ARM64 PASS, artefato baixado/checksum/hdiutil/arquitetura conferidos. Intel/Windows ainda empacotando; links e hashes no guia de instaladores. Inicialização básica do DMG Intel debug passou por dez segundos, com diretórios isolados e sem credenciais. GUI completa permanece pendente. Continuidade permanente: [CONTINUIDADE.md](../CONTINUIDADE.md).
