# Relatório de remediação — Open Dot 2.0

Data: 20/10/2026. Branch própria `codex/od2-runner-remediation`; base real `2b7d5c5fb7f6255c2bdefbabe67f38d34a2faea5`. Código final: c7b2426ec7f848546191cd52ed4937ac2c8a81aa. SHA do relatório: `git log -1 --format=%H -- docs/audit/REMEDIATION_REPORT.md`. Worktree isolado identificável pela branch em `git worktree list --porcelain`. Checkout anterior preservado. Nenhum push desta rodada, merge/main, release, deploy, migração remota, mudança de visibilidade ou cobrança.

## Auditoria disponível e método

Auditoria independente Cursor foi relatada pelo mantenedor. CURSOR_INDEPENDENT_AUDIT.md e CURSOR_REMEDIATION_PLAN.md não estavam acessíveis nas buscas documentadas em REMEDIATION_RUN. Não inventamos SHAs/linhas/testes do relatório ausente nem o modificamos. Matriz abaixo usa severidades/IDs do resumo fornecido e evidências do código atual. Blueprint/prompt e documentos anteriores relidos. Revisão deste executor não é auditoria independente; Claude Code continua pendente.

Inspeção inicial: árvore limpa, apenas um worktree antes desta rodada, branch anterior com dois recibos locais além de feae70d. Não reescrevemos histórico ou tomamos checkout de outro agente. Criamos branch/worktree próprios, usamos dependências existentes via link local temporário e target Rust separado. Não foi comprovada ausência de processos externos não registrados; execução permaneceu sequencial.

## Matriz de revalidação

| ID / severidade original | Evidência atual e arquivos | Resultado / dependência | Regressão e commit |
|---|---|---|---|
| P0-1 / P0 | runner/routes.ts:91–102, cancel/claim/event | Pedido de parada distinto de ACK; revogação/timeout uncertain, lease 30 s/teto 20 min; não reentrega task. CAS cerca resultados tardios. Não mata processo offline por declaração | Cancel queued/running, chamadas simultâneas, revogação, segunda task, rede sem ACK, recibo tardio; 2c250c6 |
| P0-2 / P0 | routes.ts + jobs.ts + executor/journal | Cron/leitura/claim reconciliam sem retorno do Runner; ownership e conteúdo parcial preservados. Journal não repete geração. Crash real durante geração do CLI continua não testado | SIGKILL/restart em filho real com proposta fixture, Codex real separado; 88c2ecb, 7bd76af |
| P1-1 / P1 | worktree.rs:46,140 + RunnerWorkspace + migração 0012 | Consentimento prévio específico, ownership antes de metadata e base SHA fixa; recuperação recusa escopo diferente. Cleanup assistido, enumeração ampla de órfãos e coordenação entre aplicativos continuam parciais | Git real: sem consentimento não altera lista; colisão preserva mudanças; 681e44e |
| P1-2 / P1 | codex.rs config/config_tests, Cargo.lock | Árvore TOML, leitura somente, segredos/.git negados; controles/globs/escapes/aspas recusados. Aspas duplas foram recusadas pelo CLI real; não houve exploração comprovada | Parser local + sandbox oficial para espaços/Unicode e canários; 681e44e |
| P1-3 / P1 | protocol.ts, channel.rs:221, routes.ts | Protocolo 2, contrato/capacidades/schema negociados; transporte online separado de compatibilidade. Versões antigas bloqueiam execução. Rollout não realizado | Antigo/ausente, contrato/caps diferentes, schema não pronto, canal real; 915f838, 681e44e |
| P1-4 / P1 | channel.rs:184 + device/revoke | Disconnect local bloqueia, pending durável retenta; só confirma revogação com servidor ou 401. Nunca envia bearer ao frontend | Servidor 503 fixture, Keychain/canal real, token anterior recusado; 915f838, 88c2ecb |
| P1-5 / P1 | RunnerWorkspace.tsx:73,300 + worktree.rs apply | Payload raw/UTF-8 verificado, conteúdo completo/escapado, antes/novo e contexto. Substituição exige beforeContent/beforeHash. Não transfere privilégios | Unicode/bidi, conteúdo ausente, replay/stale, payload truncado e browser com modelo real; 681e44e, 88c2ecb |
| P1-6 / P1 | routes.ts:276–314 | Duplicata só do mesmo digest, sequência regressiva negada, accepted depende de persistência/transição e aprovação exata no batch | Corridas injetadas e SQL real, incluindo proposta concorrente com aprovação existente; 2c250c6 e c7b2426 |
| P1-7 / P1 | Política/ADRs e executor | Sem shell/testes de projeto ou paralelismo. Expert/ODCP/memória não viram ferramentas | Gates permanecem fechados; nenhum recurso avançado foi habilitado por schema |
| P2 | worktree/journal/memory/account | fsync Unix, leitura limitada, recuperação mista 8 KB; legado saturado uncertain sem falso recibo; auth/consentimento/TTL/exclusão e project_id validados. Exclusão de conta com Runner reproduziu 500 e foi corrigida | Rust 16; SQLite/API/browsers; 7bd76af, 5e521ca, b8ef7da |

As linhas são do código desta rodada, não citações da auditoria Cursor ausente. Matriz é revalidação técnica, não declaração de que todos os P0/P1 estão encerrados.

## Recursos e fases

- **A concluída no escopo disponível:** preservação Git, baseline, documentos e matriz; originais Cursor/Dossiê ausentes registrados.
- **B/C/D parciais, incrementos operacionais:** cancelamento/revogação/leases/recibos, negociação, ownership, aprovação exata, parser e recovery validados. GUI nativa completa e crash durante geração ainda pendentes.
- **F parcial, funcional localmente:** API e Workspace reais para consentir/ler/adicionar informação user-provided, Passport memory-only e forget. Snapshots cifrados com CAS e revisão de consentimento na própria SQL; TTL 1–90 dias, quota vinte projetos e tombstones. Import/export autenticados testados, sem autoridade executável. Sem editor completo de grafo/decisões, aprovação humana de memória ou Passport completo de Git/tarefas.
- **E/H não habilitadas:** scheduler ODCP com Git, snapshots/commits automáticos e paralelismo exigem isolamento/leases/coordenação e revisão independente. Contratos existentes continuam dados, não enforcement completo.
- **G parcial pré-existente:** perfis e diagnóstico, Codex limitado real. Claude/Cursor sem drivers operacionais validados; nenhum modelo/entitlement inventado.
- **I/J/K planejadas:** Idea to Project executável, Design Intelligence, Evidence Registry/Model Lab/Council completos não implementados. Cenário de datas de preço nos testes de memória não é Idea to Project concluído.
- **L parcial pré-existente:** aprovação autenticada pelo Workspace real; iPhone/Web Push/reatenticação forte sem validação real.
- **M preparação parcial:** relatório, segurança, compatibilidade e handoff; beta pública não recomendada.

## Evidências finais

| Verificação | Resultado e limite |
|---|---|
| npm run check | 301 Node, sete Python, avaliação sintética Correio, typecheck/build PASS (ver recibo final); não cobre produção |
| npm run lint | Zero erros, um warning preexistente DotView; identidade não alterada |
| cargo test --locked | 16 PASS, cinco ignored por padrão; ignored reais executados separadamente quando apropriado |
| Parser/sandbox oficial | PASS com espaços/Unicode e canários de leitura/segredo/symlink/escrita; sem IA. Raízes não suportadas recusadas |
| Canal/Keychain | HTTP/SQLite/cofre reais, reconexão, negociação e revogação PASS; replay do bearer recusado após disconnect |
| Recuperação | Processo auxiliar real morto abruptamente; retomada uma vez, original limpo, proposta fixture. Repetido após fsync e correção de estado misto |
| Workspace → Codex nativo | Uma chamada real oficial/ChatGPT, navegador sem mocks de API, proposta exata aprovada na UI e aplicada no worktree; pasta/pairing/prompt preparados pelo helper, não pela GUI nativa |
| UI regressão | Oito cenários Chromium PASS com API/IPC simulados, inclusive negativo de payload truncado. Não confundir com canal real |
| Memória no navegador | Sessão/HTTP/SQLite reais; consentimento, salvar, reload, export, forget PASS; seletor de projeto usa fixture sem executor. Viewport 390 sem overflow; axe sem serious/critical; captura fictícia inspecionada |
| Privacidade | Scanner de padrões sobre tracked + novos selecionados sem achados; não é DLP/auditoria histórica. O executor não abriu valores de credenciais reais; cofre/CLI usados pelo nativo, sem cópia para frontend/Git/logs |

Logs descartáveis ficam fora do Git, nomes registrados em REMEDIATION_RUN e estado estruturado. Capturas em test-results ignoradas, dados fictícios. Sem medir cobertura percentual. A chamada Codex não foi repetida para alterações determinísticas posteriores, cobertas por testes/recovery.

## Migração e compatibilidade

Migrações 0010–0013 somente em bancos descartáveis. Novo Worker exige schema 0013; protocolo Runner 2 e capacidades de consentimento/conteúdo anterior obrigatórios. Estado legado sem lease é uncertain, fila sem consentimento específico é cancelada. Não reativar como queued. Rollout deve ser aprovado e validado com backup/versões, sem deploy implícito.

Instaladores Actions anteriores continuam de feae70d e não contêm estas correções. Nenhum build Actions/novo instalador desta branch foi publicado ou executado. Runtime desta rodada: núcleo Mac Intel. ARM64/Windows só têm resultados históricos de compilação; sem validação nativa atual. Executor Windows continua desabilitado. Sem assinatura/notarização.

## Riscos e próximos passos executáveis

1. Claude: obter os originais Cursor se disponíveis, comparar esta matriz com HEAD real e reproduzir testes por commit; não aceitar a revisão deste executor como aprovação independente.
2. Runner: E2E gráfico completo (pairing/folder/prompt/approval/tray/reabertura) e crash do CLI durante geração; validar cancelamento nos limites de escrita, perda de rede e journal. Não autorizar retry de efeito incerto.
3. Worktree: inventário/recuperação assistida de órfãos, provas de ownership, snapshot de mudanças importantes e coordenação de metadata com outros aplicativos. Nenhuma remoção automática implementada.
4. ODCP: tentativas/run próprios, journal de fase e snapshot CAS, timer em ponto seguro antes de commits automáticos; modelo de revisão e policy de sync exatos. Não liberar paralelismo por existir lease de tarefa Runner.
5. Comandos/testes: sem execução enquanto sandbox de fs/rede/processos/CPU/RAM/cancelamento não for demonstrado em cada SO. Nome npm test não é garantia.
6. Memória: revisar fronteira HTTP/consentimento, retenção/backup, quota/tombstones, auditoria de decisões humanas e Passport completo. Export não transfere privilégios.
7. Providers/Idea/Design/Council: implementar em novas unidades depois dos gates essenciais; autenticação oficial e custos autorizados, sem scraping privado ou fontes de preço inventadas.

Código e dados novos não foram migrados para produção. Nenhuma integração simulada foi anunciada como real. Permanecem revisão histórica de segredos/PII, licenças completas/SBOM, plataforma nativa e testes de instalação. **Não pronto para beta pública.**
