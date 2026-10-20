# Rodada de remediação Open Dot 2.0

Task: OD2-A. Base real `2b7d5c5fb7f6255c2bdefbabe67f38d34a2faea5`; branch própria `codex/od2-runner-remediation`; worktree isolado identificado por `git worktree list --porcelain`. Checkout original preservado, com dois recibos locais além de origin/feae70d. Nenhum push autorizado nesta rodada. Execução sequencial; nenhum outro worktree registrado antes da criação. Não foi comprovada a ausência de processos externos não registrados.

Os arquivos CURSOR_INDEPENDENT_AUDIT.md e CURSOR_REMEDIATION_PLAN.md não foram encontrados nas buscas por nome no repositório, temporários, visualizações e diretórios de usuário pesquisados. Dossiê adicional ausente. Não inventar linhas ou testes dessa auditoria: a matriz abaixo usa o resumo fornecido pelo usuário e inspeção do HEAD. Os documentos anteriores e Blueprint/prompt extraídos foram relidos. Auditoria independente continua distinta da revisão interna.

| ID | Severidade fornecida | Evidência atual / arquivos | Estado inicial | Dependência / correção | Regressão / commit |
|---|---|---|---|---|---|
| P0-1 | P0 | runner/routes.ts: revoke/cancel deixam running; claim exige ausência de running | Confirmado por inspeção | Transições CAS, prazo, uncertain sem replay | Cancelamento/revogação/concorrência/recibo tardio; pendente |
| P0-2 | P0 | routes.ts e executor.rs: reconciliação depende de retorno do dispositivo | Confirmado por inspeção | Prazo remoto independente, fencing de resultados | Expiração/restart/SIGKILL; pendente |
| P1-1 | P1 | worktree.rs create usa worktree add antes da aprovação de conteúdo | Confirmado; envio autoriza tarefa mas não há ownership persistido | Snapshot sem metadados compartilhados antes da aprovação, registro de ownership | Git real/falhas/checkout intacto; pendente |
| P1-2 | P1 | codex.rs config usa JSON string dentro de TOML | Insuficiência de negativos confirmada; exploração não reproduzida | Escapar estruturalmente/rejeitar controles, parser oficial | Caminhos adversariais e parser real; pendente |
| P1-3 | P1 | channel.rs e routes.ts só heartbeat | Confirmado | Versão/capacidades fail closed; rollout aditivo | Cliente antigo/novo, incompatível; pendente |
| P1-4 | P1 | channel.rs disconnect apaga cofre sem invalidar servidor | Confirmado | Revogação nativa remota/pending explícito | Reuso token antigo/rede; pendente |
| P1-5 | P1 | RunnerWorkspace ProposalView mostra texto renderizado, não bytes/escopo completos | Parcial, apresentação insuficiente | Payload exato verificável e contexto | Unicode/truncamento/hash/stale; pendente |
| P1-6 | P1 | routes.ts ignora changes do batch e duplicate não compara payload | Confirmado | CAS transacional/recibo idempotente honesto | Corridas/duplicata diferente/fora de ordem; pendente |
| P1-7 | P1 | Automação permanece desconectada | Gate vigente | Não ligar automação sobre P0/P1 abertos | Fases E–L dependentes bloqueadas |

## Continuidade

Fase A em andamento: baseline `npm run check` em execução; logs descartáveis fora do Git. Próximo: testar/reproduzir ciclo de vida e corrigir P0/P1-6 conjuntamente por compartilharem transações. Estado novo precisa distinguir cancelamento solicitado, parada confirmada e efeito incerto. Nunca reentregar tentativa anterior. Migrações somente em DBs descartáveis.

## Fase B — ciclo de vida e recibos (OD2-B1)

Implementado em routes.ts/jobs.ts/migração aditiva 0010: lease de 30 s renovada por heartbeat, prazo absoluto de tentativa 20 min; cancel_requested não renova lease; falta de ACK termina uncertain por cron/consulta/claim, sem reentregar a tentativa. Revogação deixa fila cancelled e tentativa ativa uncertain (não afirma processo parado). Recibos antigos não alteram terminal; duplicata exige mesmo digest/conteúdo, sequência regressiva é recusada e accepted exige evento + transição persistidos. Rejeição antes da aplicação continua terminal segura. Nativo reconhece uncertain e não reaplica journal. UI nomeia estados novos, sem alteração visual do Dot.

Testes: baseline completo PASS (287 Node/sete Python/eval/typecheck/build), após repetir com permissão de socket tsx; primeira tentativa teve EPERM ambiental após todos os 287 Node passarem. Gate B1 PASS: 290 Node/sete Python/eval/typecheck/build; 14 testes Runner SQLite reais, executor fixture. Concorrência de claim/cancel, timeout sem retorno, revogação ativa, recibo tardio e corrida injetada entre leitura/batch exercitados. Teste novo inicialmente presumiu ordem de UUID em mesmo timestamp: corrigida fixture com relógio crescente, sem mudar ordenação da fila. Rust em compilação em target próprio, não declarado aprovado ainda.

Limites: lease não mata processo remoto nem desfaz arquivo; uncertain preserva essa distinção. Worktrees de tentativas não são reutilizados. Não valida crash do modelo durante geração. Nenhuma migração remota. P0 parcial até regressão nativa/negociação e auditoria independente; automação E–L continua bloqueada por P1.

Próximo passo: P1-3 negociação explícita antes de heartbeat/claim; P1-4 revogação nativa com pending persistente; depois snapshots/worktree e parser/aprovação. Arquivos alterados e commit exato: git show --stat e git log. Nenhum push.

## Fase C — negociação e desconexão (OD2-C2)

Protocolo 2 e contrato sha256-utf8-json-v1 negociados explicitamente. Heartbeat legado mantém distinção transporte/compatibilidade, mas não libera tasks/claim; nativo consulta protocolo/schema antes de anunciar disponibilidade. Capacidades mínimas não representam catálogo de modelos nem entitlement. Migração 0011 aditiva, apenas bancos descartáveis. Rollout obrigatório: migrar/adotar Worker e Runner compatíveis em etapa autorizada; código antigo permanece bloqueado para execução, sem deploy implícito.

Desconexão nativa agora persiste revocation-pending, bloqueia execução antes da rede e solicita revogação do próprio bearer. Só remove cofre/vínculo ao confirmar revogado ou credencial já recusada (401). Falta de rede mantém pedido e retenta no heartbeat/restart; frontend só recebe diagnóstico, nunca bearer. Endpoint de revogação próprio foi acrescentado em B1. Teste SQLite confirma reuso negado. Teste nativo estendido aguarda compilação em target isolado.

Gate TS completo PASS: 292 Node/sete Python/eval/typecheck/build. Lint zero erros/aviso DotView preexistente. Testes cruzam protocolo ausente/antigo, contrato diferente, capacidades faltantes e protocolo atual. Não comprovam GUI ou rede móvel. Rust pendente: checkpoint de desenvolvimento explícito até prova nativa. Próxima unidade P1-2 usa serializador TOML já presente transitivamente (nova dependência direta pequena, sem nova crate no lock); testes de parser oficial não consomem IA. P1-1 e P1-5 ainda abertos; não liberar automação.

## Fase C — consentimento, ownership, sandbox e conteúdo exato (OD2-C3)

P1-1: worktreeConsent=true exigido pela API e verificado no host antes de git worktree add. UI exige consentimento separado para metadados Git; migração 0012 cancela fila legada não autorizada em DB descartável. Arquivo ownership exclusivo task/project/base/consent persistido antes de add; archive de SHA fixo preparado antes de metadata. Recovery valida ownership. Colisões/falhas preservam worktree e registro; nenhuma limpeza automática. Não há cleanup assistido nem lease de metadados entre aplicativos externos: esses aspectos continuam parciais.

P1-2: política construída como árvore TOML e serializada por toml 1.1.8 já existente no lock (passou a dependência direta). Root com glob, controles, escapes ou aspas é recusada. Negativos unitários para chaves/aspas/backslash/espaços/Unicode/newlines. Ensaio real do CLI recusou inicialmente nome com aspas duplas; não foi exploração. Após recusa prévia conservadora, parser/sandbox oficial PASS para espaços e Unicode, com canários de leitura autorizada, leitura externa/symlink/segredo e escrita negadas. Fonte oficial consultada: https://learn.chatgpt.com/docs/sandboxing (consulta 20/10/2026); o comportamento da versão instalada foi testado, não presumido da documentação.

P1-5: servidor entrega raw original cifrado junto ao hash; navegador verifica SHA-256 dos bytes UTF-8 antes de habilitar aprovação. Mostra hash, escopo, mecanismo/projeto, conteúdo integral, JSON escapado de Unicode/controles e comparação anterior/novo por substituição completa. Proposta de substituição exige beforeContent verificável pelo beforeHash; host limita contexto anterior a 8 KB. Preview de eventos deixa de duplicar conteúdo. Nenhuma autorização nova para shell/rede/commit. Legacy client sem capacidades novas bloqueado pela negociação.

Gate: check PASS 294 Node/sete Python/eval/typecheck/build; Rust 15 PASS/cinco ignored separados; parser oficial PASS sem IA; canal/cofre/negociação/revogação reais PASS, incluindo replay do token recusado após desconexão. Sete UI API/IPC simulados PASS. Primeira execução UI concorreu com rebuild e viu assets anteriores/preview duplicado: rodada descartada e repetida sequencialmente após build final, sem reduzir assertions. Primeiro build Rust começou antes de acrescentar toml ao grafo e não resolveu a crate: nova invocação com lock atualizado passou. Lint da unidade anterior sem erros; repetir gate final ao estabilizar.

Próximo: SIGKILL/restart e uma regressão Codex real justificada pela mudança no contrato/proposta; depois durabilidade de journal/diretórios. P0/P1 não declarados integralmente encerrados; auditoria independente original ausente, crash durante geração do modelo/GUI completa continuam sem prova. Novas fases com automação/paralelismo bloqueadas até gates críticos. Commit responsável: git log --grep OD2-C3 ou log deste arquivo. Nenhum push.

## Fase D — estabilização e prova navegador/nativo (OD2-D1)

Novo scripts/test-runner-browser.ts serve build real com API/SQLite descartáveis, autentica sessão fictícia e usa Chromium sem interception/mocks para revisar/aprovar proposta do Codex real. Uma chamada oficial ChatGPT: PASS; worktree aplicado uma vez e checkout original limpo. Pareamento, pasta e envio do prompt ainda são programáticos no helper Rust; não declarar fluxo gráfico completo, iPhone ou tray. Novo modo opcional OPEN_DOT_BROWSER_APPROVAL só em cfg(test), não muda executor de produção. Payload truncado com hash válido do original bloqueia o botão em teste UI simulado.

P2: journal agora sincroniza diretório após rename/remoção no Unix; arquivos aprovados sincronizam cadeia de diretórios, ownership é protegido 0600 e sincronizado antes de metadata, pedido de revogação faz fsync. Rust 15 PASS; SIGKILL/restart repetido após mudança PASS. Isso não comprova perda de energia ou durabilidade Windows (executor continua bloqueado). Testes adicionais de lease com teto e registro legado seq=500 fecham uncertain sem fabricar recibo ou repetir a tarefa. Gate completo 295 Node/sete Python/eval/typecheck/build PASS; lint zero erros/um aviso preexistente. UI W1–W6 PASS; cenários nativos simulados R1/R2 em fechamento.

Fases B/C/D: incrementos validados, mas P1-1 cleanup assistido/coordenação externa e GUI completa continuam parciais. Não implementar scheduler Git/commits/paralelismo E/H sobre esses limites sem isolamento e revisão independente. Próxima tarefa independente segura: fase F, autorização/consentimento/retenção/exclusão para ledger interno, sem ligar execução de agentes. Novas rotas somente local/testes, sem deploy. O produto 2.0 não está completo ou pronto para beta pública.

## Fase F — memória HTTP e Passport parcial (OD2-F1)

Implementado adaptador real por sessão/CSRF em /api/projects/:id/memory, policy, consent, export e forget. Dono vem do auth, nunca do body. Consentimento revisionado opt-in 1–90 dias; vinte projetos cadastrados por dono. Guard SQL vincula CAS do ledger à revisão/validade do consentimento; corrida com forget não pode recriar snapshot. Renovações após expiração apagam snapshot velho antes de reativar consentimento. Cron faz expurgo lógico; tombstones preservam revisão, não significam apagamento físico de WAL/backups. Migração 0013 só em bancos descartáveis.

Passport memory-only pode ser exportado explicitamente e restaurado por sessão autenticada nova; nenhum segredo/autorização/ferramenta é transferido. Promoção a user-approved permanece bloqueada. Memória na UI, aprovação humana de decisões, proveniência de teste assinada e Passport completo com Git/tarefas ainda parciais/planejados. Sem scheduler ligado ao ledger ou envio automático a provedores.

Achado adicional reproduzido: /api/account/delete retornava 500 se dono tinha tasks/devices Runner (FK). Correção mínima: excluir eventos/aprovações antes de tasks/devices e incluir ledgers/políticas na transação existente. Regressão reproduziu 500 antes e PASS depois, preservando todos os dados de outro dono. Nenhum banco real/conta real foi apagado; só fixtures.

Gate final F1: 300 Node, sete Python, avaliação sintética Correio, typecheck/build PASS. Quatro testes HTTP de memória mais quatro de privacidade PASS; abrangem auth/CSRF, isolamento, dados cifrados, CAS concorrente, corrida injetada com revogação, expiração/renovação/importação, limites/corpo grande e consentimento concorrente. Lint zero erros/aviso DotView preexistente. UI anterior oito cenários PASS; nenhum redesign. Próximo: registrar matriz consolidada e handoff, revisar P0/P1 residuais antes de qualquer automação. Fase E e H permanecem bloqueadas no escopo de execução; F não amplia permissões do Runner. Sem push, deploy, migração remota ou publicação.

## Fase F — interface operacional de memória (OD2-F2)

ProjectMemory ligado ao projeto autorizado selecionado no Workspace. Usuário consente por 30 dias, lê/adiciona informação user-provided (não user-approved), revisa Passport memory-only e confirma forget. Sem armazenamento secreto no frontend, sem fornecer ferramentas ou envio a agentes. Cor/forma/animações do Dot não alteradas; apenas regras de quebra de texto no novo painel. Não é editor completo de decisões/grafo, aprovação humana de memória ou Passport completo.

Gate completo continua PASS com 300 Node/sete Python/eval/typecheck/build. Teste real `node --import tsx scripts/test-runner-browser.ts --memory-only` PASS: navegador sem mocks de API, sessão/HTTP/SQLite reais, consentimento, persistência após reload, export e exclusão confirmada. Seleção de dispositivo/projeto é fixture explícita sem executor; nenhum provider é iniciado nessa opção. Primeiro seletor getByLabel exato não encontrou combobox e expirou: corrigido para role acessível, sem alterar a interface para satisfazer o teste. Repetição PASS, incluindo viewport 390 px sem overflow, axe sem serious/critical e screenshot real inspecionada. Artefato ignorado em test-results/memory/real-memory-mobile.png, somente dados fictícios. Não repetir modelo por esta mudança de UI.

Próximo: fechamento M de compatibilidade, segurança/documentos e revisão independente. E/H (scheduler com Git/paralelismo), G (drivers adicionais), I/K (execução de projeto/IA adicional) continuam limitadas pelos gates de isolamento/revisor/provedores; não liberar capacidades a partir de contratos. Os testes não substituem auditoria independente. Nenhum novo push ou instalador desta branch.

## Revisão D2 — retomada no limite de revisão

Revisão interna encontrou que aplicar novamente prepare() durante recovery somava bytes do estado misto (arquivos novos já aplicados + versões anteriores restantes) ao orçamento de conteúdo anterior. Fixture de dois arquivos de 8 KB reproduziu falha antes da correção. Separada validação da proposta aprovada da inspeção do estado atual: aceita somente hash anterior ou conteúdo final exato, revalida cada arquivo antes da escrita e limita leitura a 8001 bytes em vez de alocar arquivo inteiro antes de medir. Limites assinados anterior/novo continuam independentes de 8 KB cada. Nenhuma aprovação adicional ou acesso a outro caminho.

Rust: 16 PASS/cinco ignored; novo caso falhou antes e passou depois. Gate completo e SIGKILL/restart final em execução; não repetir modelo, pois a alteração é na validação/aplicação determinística coberta pela fixture. Revisão interna não substitui auditoria independente. Próximo: registrar resultado e checkpoint D2, depois handoff M com todos os gates e limitações.

Gate D2 concluído: 300 Node/sete Python/eval/typecheck/build PASS; 16 Rust PASS/cinco ignored; SIGKILL/restart real PASS após correção, sem nova chamada de modelo. Caso misto de 8 KB falhou antes/passou depois. Fonte do checkpoint por git log deste arquivo; próxima ação é auditoria e handoff, sem liberação automática de comandos ou paralelo.

## Revisão D3 — recibo de proposta concorrente

P1-6 adicional reproduzido: uma leitura stale sem aprovação, seguida por outra transação aprovar a primeira proposta, permitia inserir novo evento proposal quando a linha única de aprovação já existia. O handler respondia 200 para digest que não havia sido persistido como aprovação. Novo teste injetou a leitura stale e falhou antes (200 em vez de 409). Evento de proposta agora exige, na mesma transação, proposal_enc e digest correspondentes à aprovação criada por aquele batch; corrida retorna 409 sem evento/transição novos.

Gate completo PASS: 301 Node, sete Python, avaliação sintética/typecheck/build. Vinte cenários API Runner PASS. Nenhum teste removido; proposta concorrente falhou antes e passou depois. Recuperação nativa final após SQL em execução; sem repetir modelo. Relatório consolidado em preparação, ainda sem publicação ou liberação de automação.

## Fechamento M — evidência consolidada

Fonte c7b2426. Regressão final: 301 Node/sete Python/eval/typecheck/build; lint zero erros/aviso preexistente; 16 Rust/cinco ignored separados; oito UI simulados no build final PASS. Parser/canal/cofre reais PASS; recovery SIGKILL repetido após D3 PASS. Modelo real usado uma vez para aprovação no navegador; nenhum modelo adicional para testes determinísticos ou memória. Memória no navegador com API/SQLite reais, projeto fixture, mobile390/axe PASS e captura inspecionada.

Matriz final, limites e plano Claude em REMEDIATION_REPORT/INDEPENDENT_REVIEW; estado estruturado em ENGINEERING_STATE.json. Documentos originais Cursor não acessíveis; nenhum foi editado. Checklist de publicação permanece reprovado: sem auditoria independente atual, GUI nativa/geração-crash/plataformas completas, histórico/licenças/SBOM e isolamento de comandos. Nenhum novo instalador/Actions desta branch. Todos os commits novos permanecem locais, sem autorização de push. Link temporário de dependências removido ao fechar; somente gerados ignorados fora do código. HEAD documental final deve ser consultado via git log do arquivo.

## Continuação — OD2-ODCP-015

Base desta continuação 1d9125f. Índices compartilhados em docs/agents; checkpoint documental 5d8dead. Serviço interno de checkpoints cifrados/CAS e migração aditiva 0014 implementados; sem rota/scheduler/commit automático. Gate local: 306 Node, sete Python, avaliação sintética, typecheck/build PASS; lint zero erros e aviso preexistente DotView. Três testes específicos cobrem persistência, concorrência, retomada incerta e campos de verificação. Nenhuma migração remota ou alteração de identidade visual.

## Continuação — OD2-SHARED-002

Helper local operacional atualiza apenas coordination do ENGINEERING_STATE.json com revisão CAS, lock exclusivo, rename/fsync e bloqueio de troca de ownership ativo. CLI observa branch/HEAD com execFile sem shell. Testes reais de filesystem: escritor concorrente único, evidências preservadas, handoff explícito, stale revision, lock abandonado e symlink recusados. CLI executado neste worktree em revisões 1 e 2. Não é scheduler nem proteção contra editores que ignoram o protocolo. Gate 306 inclui dois testes do helper.

## Gate de continuação — OD2-AUDIT-016

Memória com browser/API/SQLite reais PASS (seleção de projeto fixture; sem IA). Canal nativo HTTP/SQLite/Keychain pareamento/restauração/heartbeat/revogação PASS, sem tarefa de driver. Rust 16 PASS/5 ignorados após permitir socket local; tentativa anterior falhou no bind por PermissionDenied do sandbox, não por regressão do código. Relatório atual e brief Claude preservam os resultados históricos separadamente. Templates locais de issues/PR preparados; renderização remota não testada. Sem push/Actions/installers/IA/ARM64/Windows nesta continuação.

## OD2-LOOP-017 — scheduler persistente

Sobre 940b06c, fila real do Runner recebe tarefas elegíveis de planos opt-in; fases/dependências, tentativa distinta, transação CAS, pausa e recuperação por recibos. Sem retry incerto, shell ou integração implícita de worktrees. Migração 0015 somente SQLite descartável. Testes de router/SQLite usam recibos de executor fixture. Uma falha inicial de teste multiowner veio da fixture /session/dev (dono fixo), corrigida criando sessão real para segundo dono; não houve vazamento confirmado na aplicação. Gate completo e testes específicos antes do commit. Próximo: UI operacional para criar/acompanhar planos e ensaio nativo separado.
