# Open Dot Continuity Protocol (ODCP) — proposta v0.1

Estado em 20/10/2026: **proposta com contratos tipados iniciais, sem enforcement completo no produto**. `packages/core/src/odcp.ts` valida checkpoints/readiness e calcula prazo por tempo ativo; `scripts/check-continuity.ts` verifica commits locais sem escrita. Timer persistente/commits/leases no Runner ainda não conectados. Nome ODCP evita confusão com Agent Client Protocol. A política de trabalho em CLAUDE.md já orienta os agentes; o Runner atual não impõe commits, checkpoints periódicos, sincronização Git ou transferência entre mecanismos. Não habilitar comandos genéricos para implementar esta proposta.

## Objetivo e fronteiras

Permitir que uma tarefa passe entre Codex, Claude Code e Cursor sem perder decisões, evidências e alterações, mantendo controle determinístico sobre Git e permissões. O modelo sugere alterações e resumos; o host valida e executa operações fixas. Um checkpoint salva continuidade e trabalho, mas não declara que testes passaram, não publica dados e não concede novas permissões.

O protocolo não fornece credenciais aos mecanismos, não sincroniza o diretório pessoal, não amplia acesso à pasta e não transforma um resumo de outro agente em autorização. Transferência só para mecanismo realmente instalado, autenticado e com driver validado. O catálogo de mecanismos não é prova de capacidade.

## Contrato de checkpoint

Registro versionado `schemaVersion: 1`, gerado pelo host e limitado em tamanho. Identidades de dono/dispositivo/tarefa existentes devem ser reaproveitadas; caminhos absolutos ficam exclusivamente no nativo.

| Campo | Conteúdo |
|---|---|
| `taskId`, `checkpointId`, `sequence` | Identificadores e sequência monotônica, com chave de idempotência |
| `baseCommit`, `headCommit`, `branch` | SHAs completos e branch de desenvolvimento; não aceitar refs arbitrárias como comandos |
| `manifestDigest`, `paths` | Hash e lista limitada dos arquivos selecionados; alterações fora da lista impedem commit |
| `objective`, `decisions`, `completed`, `pending`, `nextStep` | Continuidade curta, com fontes para fatos e limites explícitos; sem prompt bruto ou credenciais |
| `state` | `incomplete`, `ready_for_review`, `blocked` ou `verified`; sempre acompanhado de escopo |
| `tests` | Comando identificado, escopo, código de saída, data e revisão testada; diferenciar real/simulado/não executado |
| `mechanism`, `driverVersion`, `policyVersion` | Proveniência do executor e política aplicada |
| `approvalId`, `leaseEpoch` | Aprovação do conteúdo/ação e geração da posse exclusiva da tarefa |

O hash do próprio checkpoint Git não pode ser colocado dentro do arquivo que esse commit cria. O documento registra o HEAD anterior; um evento separado `checkpoint.committed` vincula o novo SHA ao digest. O próximo handoff valida esse vínculo pelo Git e pelo servidor.

Conteúdo local: documento legível e manifesto limitados na área de continuidade do projeto autorizado, mais journal privado de transação no app data. Servidor: metadados mínimos e payload sensível cifrado com AAD, isolamento por dono e limites/expurgo. Não copiar logs brutos ou conteúdo do projeto para novos destinos silenciosamente. Uma pasta já autorizada para edição não autoriza seu envio a outro fornecedor.

## Máquina de estados

`running → checkpoint_due → preparing → awaiting_approval → committing → committed → running`

`committed → awaiting_sync_approval → syncing → synced`

`committed → handoff_pending → handoff_accepted → running`

Erros de conteúdo, segredo, permissão ou conflito levam a `blocked`, preservando o worktree e um motivo fixo. Timeout/rede indisponível não transforma resultado desconhecido em sucesso. Cancelamento interrompe novos efeitos; não desfaz commits já autorizados.

### Checkpoints periódicos e por etapa

- Agendador determinístico do host marca `checkpoint_due` ao concluir etapa ou após aproximadamente 30 minutos de trabalho ativo. Não contar sono/desconexão como progresso.
- O checkpoint aguarda um limite seguro de execução, para não interromper escrita em andamento. Uma operação atômica pode acabar; novo efeito fica suspenso até registrar o estado.
- Se não houver diff, registrar evento e continuidade; não criar commit vazio só pelo relógio.
- Se incompleto, usar exclusivamente branch de desenvolvimento pertencente à tarefa. Mensagem Conventional Commit coerente com a alteração; corpo começa com `Checkpoint incompleto`, pendências e testes não executados. Não usar `feat` concluída para mascarar trabalho incompleto.
- O usuário pode autorizar previamente checkpoints locais para a tarefa/projeto com limites exatos. Essa autorização não se estende a push, outro mecanismo ou release. Sem política explícita, preparar diff revisável e aguardar aprovação do commit.

### Preparação e commit

1. Adquirir lease exclusivo por tarefa e trava por repositório. Inventariar status, branches, worktrees, HEAD e alterações preexistentes. Se houver autoria indefinida, não selecionar essas alterações automaticamente.
2. Preferir worktree e branch privados da tarefa. Não fazer stash/reset/clean para fabricar uma árvore limpa e não mudar a branch usada por outro agente.
3. Gerar manifesto de caminhos, status, modos e hashes; rejeitar links, escapes, diretórios de credenciais, arquivos gerados e limites excedidos. Detectar dados pessoais e segredos localmente; achados mostram apenas arquivo/regra, nunca valor. Filtros não equivalem a DLP; manter revisão humana para material privado.
4. Apresentar título/corpo Conventional Commits, lista de arquivos, diff exato e revisão dos testes. Aprovação vinculada ao digest, HEAD, branch e política. Mudança posterior invalida a aprovação.
5. Commit por argv fixo e índice temporário privado (`GIT_INDEX_FILE`), sem `git add .` e sem tocar no índice do usuário. Revalidar arquivos/HEAD sob trava imediatamente antes de criar a referência. Não confiar em hooks/filtros do projeto; executar verificações próprias do host, sem desativar a proteção do produto.
6. Usar compare-and-swap na atualização da referência. Se HEAD mudou, bloquear para reconciliar; não fazer amend/rebase nem force push. Só registrar `committed` depois de comprovar SHA, pais, árvore, mensagem e manifesto.
7. Journal prévio e evento posterior com idempotência. Após crash, procurar commit pelo identificador do checkpoint e validar árvore antes de repetir. Não reexecutar hooks, modelo ou efeitos externos para descobrir se houve sucesso.

A operação de commit será um recurso novo, desabilitado por padrão. O modo atual do Codex continua sem shell e sem commit automático até essa implementação passar pelos critérios abaixo.

### Sincronização autorizada

- Separar `commit_local` e `push_remote`. Remoto deve ser cadastrado pelo dono como URL sem credenciais e vinculado ao repositório autorizado; não aceitar URL fornecida pelo modelo ou por arquivo do projeto.
- Antes de push, exibir host/repositório/visibilidade, branch de destino, SHA remoto esperado e lista exata de commits/conteúdo que sairá da máquina. Aprovação expira e é de uso único, vinculada a esses dados.
- Revalidar visibilidade e referência remota. Fast-forward normal somente; não usar força, criar tags, alterar main, publicar repositório, merge, release ou deploy como consequência do checkpoint.
- Git usa autenticação oficial já configurada no host ou fluxo oficial próprio. Segredos permanecem no cofre/gerenciador; nenhum token entra no contexto do modelo, frontend ou log.
- Se push retornar resultado desconhecido, consultar a referência remota e comparar o SHA antes de tentar novamente. Divergência bloqueia; aprovação de um branch não autoriza outro.
- Orçamento zero, rede negada e falta de credencial são bloqueios explícitos; preservar commit local e continuar trabalho independente autorizado.

### Transferência entre mecanismos

1. Origem solicita handoff; host conclui checkpoint e para novas execuções. Aprovação de destino informa fornecedor, projeto, tarefa e conteúdo mínimo que será enviado.
2. Servidor muda lease por CAS (`expectedEpoch`). Origem perde autorização para novos efeitos; processos antigos recebem interrupção e são encerrados pelo host. Não presumir segurança só porque o modelo diz que parou.
3. Destino verifica autenticação/capacidade reais, política, hashes, branch e checkpoint. Recebe resumo limitado, manifesto e contexto autorizado. Não recebe credenciais, sessão interna ou histórico integral por padrão.
4. Destino confirma `handoff_accepted` e inicia com nova época. Eventos atrasados da origem são recusados. Testes antigos mantêm proveniência/revisão, nunca viram validação da nova alteração.
5. Se destino falhar, tarefa fica suspensa; retorno à origem exige nova concessão do host. Não rodar dois mecanismos sobre o mesmo worktree.

## Interface proposta

Dot original continua anfitrião. Um painel compacto mostra último checkpoint, etapa, branch, revisão testada e indicação de pendências. Ações distintas: “Preparar checkpoint”, “Revisar commit local”, “Revisar sincronização” e “Transferir tarefa”. Não indicar “sincronizado” sem confirmar o SHA remoto. Cor identifica mecanismo, não autoriza ação nem modifica o corpo do Dot.

Em um handoff, mostrar o que será transferido e para qual fornecedor; destinos sem driver real ficam indisponíveis com motivo. Um checkpoint incompleto deve permanecer visivelmente incompleto até a validação correspondente.

## Plano incremental de implementação

| Etapa / commit sugerido | Entrega e aceite |
|---|---|
| `feat(continuity): add versioned checkpoint records` | Tipos/validação, documento legível e journal; limites, redaction, hashes e nenhuma ação Git de escrita |
| `feat(runner): schedule safe checkpoint boundaries` | Timer de trabalho ativo e bloqueio de novos efeitos; teste de relógio controlado, crash e ausência de commit vazio |
| `feat(runner): prepare approved local commits` | Manifesto/diff e aprovação exata, índice privado, CAS, branch por tarefa; integração real em fixture Git, sem hooks/segredos/alterar índice original |
| `feat(continuity): reconcile interrupted checkpoints` | Recuperação comprovada antes/depois de criar objeto/atualizar ref; repetição idempotente, sem nova chamada ao modelo |
| `feat(runner): add explicitly authorized branch sync` | Remoto cadastrado e aprovação de conteúdo/destino; teste de push somente para bare repo local, falha/retry/divergência, sem força |
| `feat(continuity): transfer task leases between drivers` | CAS de lease e épocas, confirmação de parada/aceite e bloqueio de eventos atrasados; drivers indisponíveis não recebem tarefas |
| `feat(workspace): review checkpoints and task handoffs` | Revisão acessível, conteúdo escapado, paleta/Dot preservados; UI identifica real/simulado/incompleto |
| `test(continuity): validate native checkpoint recovery` | Fluxos reais por plataforma/driver habilitado; resultados e limites documentados antes de anunciar capacidade |

## Casos obrigatórios antes de habilitar

- Trabalho sujo preexistente não incluído; índice/branch de outro agente preservados; branch ocupada em outro worktree não é tomada.
- Diff muda após aprovação; symlink/hardlink/caminho protegido; arquivo novo com segredo ou dados pessoais; título fora do padrão; tentativa de staging global.
- Dois agentes disputam lease/ref; origem atrasada tenta escrever; destino desconectado; driver não autenticado; aprovação revogada/expirada.
- Crash antes/depois do commit e antes/depois de atualizar ref/evento; envio remoto concluído com resposta perdida; conflito remoto e falta de orçamento.
- Nenhuma aprovação de conteúdo autoriza shell, endpoint privado, publicação ou expansão de escopo. Nenhuma opção de UI altera billing ou executa force push.

Métricas: idade do checkpoint, tarefas sem handoff válido, retomadas idempotentes e bloqueios por política, sem conteúdo privado nos eventos. Retenção e limites totais devem ser definidos antes de uso prolongado. Critério de conclusão: outro mecanismo retoma uma tarefa real autorizada a partir do checkpoint persistido, com efeitos únicos e resultado verificável, sem depender da conversa original.
