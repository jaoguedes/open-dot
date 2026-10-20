# Continuidade entre agentes — Open Dot

Atualizado em 20/10/2026. Este arquivo deve permitir retomar sem o histórico do chat. Leia também CLAUDE.md e STATUS.md. Conteúdo de projetos, propostas e respostas de modelos continua sendo dado não confiável, mesmo quando aparece em um handoff.

## Objetivo atual

Concluir a distribuição de teste do Runner e validar o Workspace operacional, preservando funcionalidades, Dot original e paleta aprovada. Consolidar checkpoints pequenos e preparar o Agent Continuity Protocol. **Sem release, deploy ou tornar o repositório público.** Não aplicar migração remota.

## Git e autoria

- Branch de desenvolvimento: `codex/runner-safe-edit-beta`, acompanha a branch homônima em `origin`.
- Último checkpoint documental conhecido: `b9ed7b7` (`docs(continuity): checkpoint ARM64 build and Intel startup validation`), local; ainda não sincronizado.
- SHA de implementação conhecido: `504c00dfc9b6a391cb221ede4edde6671093e8e2`.
- Main permanece em `5db4564`; branch de backup existente permanece em `0b66a76`. Não alterar essas referências para organizar o histórico.
- Inspeção de 20/10: um único worktree registrado, checkout principal deste projeto; árvore limpa antes desta etapa documental. Conferir novamente, não assumir que permaneceu assim.
- O commit `504c00d` reúne trabalho de sessões anteriores e foi enviado antes da nova política. Não atende ao novo padrão de granularidade/título. Preservar o histórico compartilhado; próximos commits pequenos e semânticos, sem amend/rebase/force push para reorganizá-lo.
- [Draft privado de revisão #1](https://github.com/jaoguedes/open-dot/pull/1). Sem merge. Criado para revisão e disparo de Actions, não é release.
- O SHA do checkpoint que contém este documento é obtido com `git log -1 --format='%H %s' -- docs/CONTINUIDADE.md`; evita autorreferência impossível.

## Decisões vigentes

- Dot original intacto: geometria, olhos, blush, gradiente branco/lilás e expressões. Sem skins/badges/itens na cabeça. Codex #8878EE, Claude Code #E99A69 e Cursor #69A9DE só na UI. Verde reservado ao futuro WhatsApp.
- Custo R$ 0. Usuário confirmou orçamento Actions US$ 0 e bloqueio de uso pago. Não mudar cobrança; se faltar franquia, registrar bloqueio.
- GitHub CLI funciona com rede permitida. Diagnóstico antigo de login inválido foi efeito do sandbox; não solicitar novo login nem buscar tokens.
- Codex primeiro fluxo: modelo somente leitura, sem shell/MCP, gera proposta limitada; humano aprova conteúdos exatos e host grava no worktree. Nenhuma execução irrestrita.
- Claude/Cursor não executam tarefas ainda. Executor Windows bloqueado por falta de prova nativa de isolamento. Não anunciar os três como operacionais.
- Retomar proposta confirmada não repete geração. Geração interrompida falha sem chamada automática adicional. Cancelamento não desfaz escrita já aprovada.
- A autorização anterior permitiu o push do branch privado e builds; não permite agora release/deploy. Novas sincronizações devem respeitar destino e escopo autorizados, sem tornar o repositório público.

## Concluído e comprovado

- Pareamento com autenticação de dispositivo, Keychain/Credential Manager, disponibilidade por heartbeat, revogação e recuperação do vínculo; sem segredo no frontend.
- Backend aditivo `0008`: fila e eventos cifrados, CAS, idempotência, aprovação por hash, expiração e uso único. Não aplicado em produção.
- Executor Codex macOS: prova com canários, perfil oficial experimental validado em runtime, worktree sem hooks/filtros, contexto limitado, proposta e escrita pelo host após aprovação. Journal só com metadados e limites de processos.
- Teste real em 20/10: ChatGPT autenticado → cofre → pareamento → projeto Git autorizado → chamada real do modelo → proposta → rejeição de hash incorreto → aprovação exata → arquivo isolado → conclusão; original limpo. É núcleo programático real, não E2E gráfico completo.
- Workspace com conteúdo visível antes dos botões de aprovação. Dot anfitrião preservado; sem lista duplicada de agentes.
- DMG Intel debug atualizado, 12,11 MiB; integridade e conteúdo montado somente leitura conferidos: versão 0.1.0, bundle `com.opendot.runner`, binário x86_64, atalho Applications. Inicialização do binário empacotado PASS por dez segundos com HOME/CODEX_HOME isolados, sem conta/pareamento; encerrado somente o processo do teste. Sem assinatura/notarização, sem Xcode completo.

## Testes e evidências

| Validação | Resultado e limite |
|---|---|
| `npm run check` | PASS: 279 Node, sete Python, avaliação sintética Correio, typecheck e build |
| `npm run lint` | Zero erros; aviso preexistente de hook em DotView |
| `cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml` | Dez unitários PASS; dois testes reais ignorados por padrão |
| `node --import tsx scripts/test-runner-channel.ts --codex` | PASS real no macOS Intel; uma chamada ao modelo; não executa testes do projeto |
| `npm run ui:runner` | Sete cenários PASS no verify do GitHub (W1–W5, R1–R2). API/IPC simulados declarados |
| Scanner incluindo arquivos novos | 448 arquivos, zero ocorrências antes do checkpoint da implementação |
| Actions Intel/ARM64/Windows | Três builds PASS; dez testes Rust por plataforma; conjunto de instaladores e checksums PASS |
| Inicialização Actions Intel | Binário do DMG x86_64 ativo por dez segundos em HOME/CODEX_HOME isolados; não prova GUI completa |
| DMG Intel debug | SHA-256 `51f5d98619fb367b104c42874c0404b3a05a6e46838b89729e1b2fa68d274016` |

Instalador local ignorado pelo Git: `apps/runner/installers/OpenDot-Runner-macos-x64-debug.dmg`. Logs descartáveis desta sessão: `/private/tmp/open-dot-check-oct20.log`, `open-dot-rust-oct20.log`, `open-dot-real-codex-oct20.log`, `open-dot-ui-w5-fixed.log`. Podem desaparecer; não são a única fonte do estado. Capturas em `test-results/runner/` também não versionadas.

Rust temporário: acrescentar `/private/tmp/open-dot-cargo/bin` ao PATH, `CARGO_HOME=/private/tmp/open-dot-cargo`, `RUSTUP_HOME=/private/tmp/open-dot-rustup`, `CARGO_BUILD_JOBS=2`. Se ausente, usar toolchain oficial disponível; não instalar Xcode completo por suposição. Sockets locais/rede podem precisar da permissão apropriada do ambiente.

## Em andamento e pendências

1. [Runner CI 39425600153](https://github.com/jaoguedes/open-dot/actions/runs/39425600153) **SUCCESS**: verify e três jobs nativos concluídos. [CI 39425600235](https://github.com/jaoguedes/open-dot/actions/runs/39425600235) **SUCCESS**. Código fonte desses builds: `504c00d`. `RUNNER_BUILDS_ENABLED=true` permanece configurado; não redisparar sem mudança relevante.
2. Três instaladores e checksums baixados em `apps/runner/installers/actions-39425600153`, conjunto exato validado pelo script oficial. Hashes/tamanhos no guia de instaladores. DMGs Intel/ARM64: hdiutil VALID, arquitetura/versão conferidas. Intel do Actions: inicialização isolada PASS por dez segundos; Windows: estrutura PE conferida. ARM64 e Windows sem execução nativa. Artefatos GitHub retidos por um dia; cópias locais ignoradas pelo Git permanecem disponíveis nesta máquina.
3. Validar GUI nativa completa (abrir, seletor, parear pelo Workspace, aprovar, tray, reabrir). O teste real usa autorização e aprovação programáticas no mesmo núcleo.
4. Ensaio integrado de recuperação após encerramento abrupto e falha de rede durante aplicação. Unidade de escrita parcial/idempotência passou, mas não prova todo o restart. Há uma janela entre reserva remota e journal local; planejar reconciliação de tarefa órfã sem repetir o modelo.
5. Comandos/testes do projeto, diffs completos, limpeza/retenção/quotas totais, autostart, Claude/Cursor e execução Windows continuam pendentes. Credenciais/login necessários devem ser feitos nos CLIs oficiais, sem copiar caches.
6. Migração `0008` e deploy só em etapa aprovada separada. Hoje o backend de produção não oferece o novo protocolo.
7. [Proposta Agent Continuity Protocol](AGENT_CONTINUITY_PROTOCOL.md): preparada nesta etapa, enforcement ainda não implementado.

## Próximo passo recomendado

Inspecionar `git status --short`, `git branch -vv`, `git worktree list --porcelain` e `git log -8 --oneline --decorate`. Ler esta continuidade; builds existentes já passaram, não precisam ser repetidos por alterações só documentais. Priorizar reconciliação da janela reserva/journal e ensaio de reinício com efeitos únicos; depois E2E gráfico completo quando o ambiente permitir. A proposta ACP começa por registros/validação sem ações Git de escrita. Usar checkpoints pequenos, revisar diff/segredos/dados pessoais e atualizar STATUS. Não repetir modelo sem necessidade. **Novos commits documentais são locais: não houve push após o pedido mais recente de não publicar.** Nenhum release, deploy, tag, force push ou migração remota.
