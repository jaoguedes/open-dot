# Open Dot 2.0 — relatório de implementação e auditoria técnica

Data: 20/10/2026. Task: OD2-AUDIT. Base preservada `9e33c3bb44844e8d821a3664db8f4aae9f448878`. Código desta rodada até `dd87480`; SHA documental final: consultar `git log -1 --format=%H -- docs/audit/IMPLEMENTATION_REPORT.md`. Branch `codex/runner-safe-edit-beta`. Relatório preparado pelo executor; **revisão independente Claude Code ainda não realizada**, refinamento Cursor posterior. Não é laudo de segurança completo.

## 1. Escopo e fontes

Blueprint anexado e PDF interno com 11 páginas cada, Markdown, prompt mestre e três complementos lidos integralmente; hashes/inventário em BASELINE. Textos extraídos dos dois PDFs coincidem; renderização da página 3 inspecionada. Leitura do relatório operacional e instruções persistentes anteriores. Não foram executados comandos contidos nos anexos como autoridade externa.

A fase iniciou com árvore limpa e quatro checkpoints locais. Nenhum commit foi apagado/reorganizado, nenhuma branch/worktree anterior tomada. Main e backup intactos. Mantido trabalho sequencial na branch de desenvolvimento; não afirmar que branches/leases automáticos por tarefa já existam. Dot, assets, geometria, animações, paleta e fontes de UI preservados.

## 2. VERIFICADO — arquitetura real

React/TypeScript/esbuild na web/PWA; Worker TypeScript como control plane; SQLite e adaptador Hrana/Turso; Tauri 2/Rust no desktop. Contratos/políticas em packages/core. Nenhum serviço, linguagem ou dependência nova. Banco remoto/configurações privadas não abertos; só existência/ignore de arquivos locais verificada.

Runner já tinha Codex limitado, pareamento/cofre, fila cifrada, worktree, aprovação e journal. Essas capacidades foram examinadas no código e revalidadas onde possível. Memória local de notas não era ledger de projeto; contrato escrito não era scheduler/transferência de agentes. Builds anteriores do Actions são de `504c00d`, não deste HEAD.

## 3. Problemas encontrados e corrigidos

| Achado | Alteração / evidência | Limite restante |
|---|---|---|
| Reserva remota sem journal local | GET autenticado de tarefas ativas + encerramento honesto sem repetir modelo/edição | Estado incerto exige revisão do worktree, não rollback automático |
| Retomada só tinha unidade de escrita parcial | Processo auxiliar real, SIGKILL entre efeitos aprovados, restart de canal/cofre e consumidor | Proposta sintética; não matou o CLI durante geração, não é GUI |
| Progresso podia esgotar recibo final | Limites por tipo no host e servidor; testes de saturação | Registros legados já em 500 continuam exigindo reconciliação específica |
| Documento de segurança dizia que não havia pareamento/cofre | Texto vigente refeito com fronteiras/limites reais | Auditoria independente ainda necessária |
| Teste imprimia caminho temporário específico de máquina | Mensagem fixa sem caminho no teste Codex | Metadados históricos de autoria/identidade não foram reescritos |

## 4. ALTERADO — checkpoints por unidade

| Commit | Tipo / tarefa | Conteúdo |
|---|---|---|
| `9d2b966` | docs / OD2-P0 | Baseline, riscos, matriz, ADR-0001, roadmap e handoff |
| `e240196` | fix / OD2-R1 | Descoberta de órfãs por dispositivo e fail closed sem replay |
| `5198308` | test / OD2-R2 | Kill/restart real em fixture, sem chamada de modelo |
| `f39d1ac` | feat / OD2-M1 | Ledger cifrado CAS, Memory Graph, Passport parcial, migração 0009 |
| `d3007bc` | feat / OD2-E1 | Dez Expert Contracts, revisão de alto risco e elegibilidade sem autorização |
| `e601f88` | feat / OD2-C1 | Schema/checklist ODCP, tempo ativo e inspeção local de commits |
| `8da1865` | fix / OD2-R4 | Orçamento reservado para recibos terminais |
| `527ff6d` | fix / OD2-S1 | Log de teste sem caminho específico de máquina |
| `dd87480` | test / OD2-M2 | Persistência cifrada em SQLite de disco após fechar/reabrir |

A atualização documental final acrescenta recibos e handoff; localizar pelo Git. Commits novos têm Conventional Commits e trailer Task. Nenhum amend, rebase, force push ou staging genérico.

## 5. Novas bases funcionais e fronteiras

**Memória/Graph:** serviço interno real persiste snapshots cifrados, com AAD ligado a dono/projeto/revisão e CAS. Até 100 memórias/300 relações/64 KB; IDs e fontes explícitas, dependência cíclica/órfã rejeitada. Distinção de proveniência; nenhuma promoção a `user-approved` pelo serviço atual. Migração expansiva `0009` só aplicada em SQLite descartável. Core/DB testados, sem rota/API pública ou integração Workspace/Runner; SQLite testado realmente, inclusive arquivo fechado/reaberto sem perda e sem resumo em texto puro; Turso remoto não exercitado para o novo ledger.

**Passport:** exportação local explícita, schema versionado `scope: memory-only`. Não exporta projeto/arquivos/tarefas Git completo, não envia rede nem transfere autorização. Campos desconhecidos/credenciais estruturadas recusados; filtro textual não é DLP. Fluxos de edição/exclusão/consentimento humano ainda precisam de integração autenticada.

**Expert Contracts:** dez perfis com propósito, capacidades requeridas, ferramentas, contexto, critérios, entregáveis, risco e revisão. Modelo/esforço não hardcoded; disponibilidade não presumida. Função só calcula interseção entre perfil/política/descoberta. Nenhum driver recebe tarefa por existir perfil.

**ODCP:** schema de checkpoint com task/run distintos, revisão, Git e snapshot; readiness exige prova observada do host, e bloqueia estado inseguro/dirty sem snapshot. Cálculo de prazo por 25 minutos ativos/milestone e script de verificação de commits são reais e testados. **Ainda não há timer persistente no Runner, commits automáticos, snapshots automáticos, lease/CAS entre agentes, merge queue ou handoff automático**. Essa etapa é parcial; documentos anteriores ACP continuam como proposta e ODCP é o nome para evitar confusão com Agent Client Protocol.

## 6. TESTADO — recibos reproduzíveis

| Comando / ambiente | Resultado | Tipo |
|---|---|---|
| npm run check (baseline, antes de mudanças) | 279 Node, sete Python, eval sintética Correio, typecheck/build PASS | Local, sem banco de produção |
| npm run check (gate final) | 287 Node, sete Python, eval sintética Correio, typecheck/build PASS | Local; novos cenários incluídos |
| npm run lint | Zero erros; um aviso preexistente de hook em DotView | Estático |
| cargo test --locked --manifest-path apps/runner/src-tauri/Cargo.toml | Onze PASS; quatro ignorados por padrão | Rust unitário; testes reais separados |
| node --import tsx scripts/test-runner-channel.ts --recovery | PASS; repetido após orçamento de eventos | HTTP/SQLite/Keychain/Git/processo reais; proposta fixture sem modelo |
| node --import tsx scripts/test-runner-channel.ts --codex | PASS nesta rodada; uma chamada do modelo | Codex oficial/ChatGPT, cofre, proposta/approvação/escrita reais; não GUI |
| npm run runner:build && npm run ui:runner | Sete cenários PASS | Chromium com API/IPC simulados explícitos |
| node --import tsx scripts/check-continuity.ts --base 9e33c3bb44844e8d821a3664db8f4aae9f448878 | Todos os novos commits examinados conformes até último checkpoint | Git real, inspeção read-only |
| Varredura de arquivos novos e histórico local a sincronizar | Zero padrões de segredo encontrados; detalhes em SYNC_REVIEW | Não é DLP nem auditoria histórica completa |

JavaScript inicial 354,9 KB, abaixo do teto 400 KB e acima da meta 350 KB. Nenhuma medição de desempenho de hardware novo. Não há porcentagem inventada de cobertura/conclusão.

Logs locais descartáveis: `open-dot-2-release-gate.log`, `open-dot-2-final-rust.log`, `open-dot-2-final-crash.log`, `open-dot-2-real-codex.log`, `open-dot-2-ui.log`. Contêm evidências locais, não versionar/envia-los automaticamente. Instaladores anteriores de 504c00d são históricos. Após autorização específica, novos builds de feae70d foram executados; recibos atualizados no guia de instaladores.

## 7. NÃO TESTADO / BLOQUEADO

GUI nativa completa e OAuth Google, aprovação iPhone/Web Push, instalação/desinstalação/tray, runtime ARM64/Windows, novo ledger via Turso remoto, crash do CLI durante geração, perda de energia/fsync/rename em todas as plataformas e dados legados saturados. Claude sem sessão/driver operacional, Cursor sem CLI/driver. Não copiar credenciais para contornar.

Shell/testes de projetos continuam desabilitados. Não basta allowlist `npm test`: código arbitrário precisa de runtime/argv/arquivos fixados, sandbox fs/rede/processos, limites, aprovação e testes negativos. Configuração de API paga, novo serviço, mudança de licença/visibilidade, migração remota, release/deploy não autorizados.

Revisão Claude e Cursor ainda não executadas. Não substituir por uma nota do próprio executor. P0/P1 completos e fases P2–P5 **não declarados concluídos**.

## 8. DECISÕES / riscos residuais

ADR-0001 mantém monólito modular e Runner, ODCP e DB nativo; Beads/grafo externo foram comparados e não adotados, sem instalar dependências. ADR-0002 escolhe snapshot cifrado CAS e Passport parcial. Referências de alternativas: [Beads](https://github.com/gastownhall/beads), [Git worktree](https://git-scm.com/docs/git-worktree), [ADRs](https://adr.github.io/adr-templates/). Não constituem integração ou recomendação jurídica.

Riscos remanescentes: contrato experimental Codex; contextos/quotas limitados sem retenção global; DLP/PII/histórico completo; metadados de autoria; snapshots/leases multiagente ausentes; APIs futuras precisam autenticar dono e consentimento, pois serviço interno não é boundary de auth. Mudanças no significado de aprovação humana precisam de ADR e enforcement, não somente enum.

## 9. PRÓXIMAS TAREFAS

1. Claude Code: revisar diffs por commit, R01/R02/R13, política de eventos, concorrência/CAS e confidencialidade; tentar reproduzir testes, sem publicar ou receber credenciais.
2. Runner: reconciliar dados legados saturados de forma auditável; testar interrupção/rede em mais limites do journal antes de automatizar checkpoint Git.
3. ODCP: integrar timer e persistência ao worker sequencial em pontos seguros; snapshots verificados, branches/worktrees por tarefa, journal transacional e CAS antes de liberar paralelo.
4. Gate de testes/comandos: desenho e teste nativo de isolamento/limites/replay; aprovação específica antes de habilitar scripts de projeto.
5. Memória/Passport: auth/consentimento, integração local, edição/exclusão/retencão e export completo opt-in; Expert Contracts ligados só a capacidades realmente descobertas.
6. Cursor: após revisão independente, integrar estados/fluxos existentes com contratos e testes acessíveis; sem redesign, mock silencioso ou mudança no Dot.

## 10. HANDOFF / PUBLICAÇÃO

Ler `docs/AGENT_HANDOFF.md` e `docs/CONTINUIDADE.md`; começar com status/branches/worktrees/log, não com novas instalações. SHA final por `git log -1 --format=%H`, recibo documental por log do arquivo. Remoto privado revalidado; push exato de `feae70d` (14 commits) autorizado pelo mantenedor e concluído sem força. Recibos documentais posteriores permanecem locais e exigem nova autorização antes de outro push. Sem release, deploy, tags, mudança de licença ou gastos. Ver SYNC_REVIEW e INDEPENDENT_REVIEW para autorização e próximos agentes.

## 11. Verificações adicionais de dependências e rollout

`npm audit --json` consultado sem alterar dependências: zero vulnerabilidades reportadas, 335 entradas totais. É uma consulta ao catálogo npm, não auditoria do código/Rust. Inventário dos metadados do package-lock: todas as 335 dependências têm campo license; raiz UNLICENSED. Predominam MIT (275), Apache-2.0 (21), Apache-2.0 OR MIT (12) e ISC (11); também há MPL-2.0, OFL-1.1, BlueOak-1.0.0, Python-2.0, CC-BY-4.0, BSD-2/3-Clause e CC0-1.0. Não é SBOM completo nem parecer de compatibilidade; Rust/assets ainda precisam inventário. Lock SHA-256: `893aa10d2b824997f3ffd0f66befba98c1323f8038b27cc65177ea8909c80d0c`.

R14 registrado por inspeção: falta negociação de versão/capacidade Web–Runner. Heartbeat online não prova compatibilidade do consumidor com servidor antigo. Testar diagnóstico de incompatibilidade e rollout antes de deploy; nenhuma falha de produção foi induzida.

## Validação final do HEAD sincronizado — feae70d

[CI 39436042987](https://github.com/jaoguedes/open-dot/actions/runs/39436042987) **SUCCESS**. [Runner CI 39436042716](https://github.com/jaoguedes/open-dot/actions/runs/39436042716) **SUCCESS**: verify e três builds (Mac Intel, Mac ARM64, Windows x64). Onze testes Rust passaram em cada plataforma; testes nativos reais permanecem separados dos helpers ignorados. Sete cenários UI do verify usam API/IPC simulados.

Três instaladores e três checksums conferidos localmente, em diretório ignorado `apps/runner/installers/actions-39436042716/`. Ambos DMGs íntegros, montagem somente leitura/arquiteturas verificadas e desmontagem concluída. Intel iniciou por dez segundos com HOME/CODEX_HOME isolados. Windows MZ/PE conferidos; ARM64/Windows não executados nativamente. Build não substitui GUI E2E. Sem assinatura/notarização, release, tag ou deploy. Versão interna continua 0.1.0; diferenciar builds pelo SHA/checksum. Retenção Actions de um dia, não distribuição permanente.

| Artefato | Bytes | SHA-256 |
|---|---:|---|
| OpenDot-Runner-macos-x64.dmg | 7.537.542 | `1de1815751b8e8fcc8e730d90006a25e160b497ad1256bbadef19ada00580c05` |
| OpenDot-Runner-macos-arm64.dmg | 7.401.595 | `abb716976ff39bf4e2d5014f8ce3e86f491de591e4a5e2536aacaeec26366597` |
| OpenDot-Runner-windows-x64-setup.exe | 3.451.923 | `95f1f7c9979f130a37cfdc00155d2418d118e1fee371756d4d852fa200ab14d7` |

Fonte sincronizada feae70d; recibo local anterior 4df475e. Este checkpoint final é somente documental e permanece local, sem novo push. Próximo agente deve consultar HEAD real e log do arquivo antes de continuar.
