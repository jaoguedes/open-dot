# Memória compartilhada dos agentes

Entrada operacional: [PROJECT_STATE.md](PROJECT_STATE.md). Código e Git prevalecem sobre relatos históricos. Um único escritor nesta branch; outro agente deve abrir sua própria branch/worktree e registrar handoff, sem sobrescrever este estado. Checkpoints do produto usam CAS; Markdown não possui bloqueio distribuído.

Leia o estado, confira Git, reproduza evidências relevantes e retome a primeira tarefa elegível. Transferência de contexto nunca transfere credenciais ou permissões.

## Atualização coordenada do estado estruturado

Com o checkout próprio conferido, use:

```sh
node --import tsx scripts/update-agent-state.ts <revisão-atual> codex OD2-TASK-001 active
```

O comando observa branch e SHA via Git sem shell e modifica somente `coordination` no ENGINEERING_STATE.json, preservando as demais evidências. Ao concluir, avance com `checkpointed` ou `handoff`. A revisão esperada impede sobrescrita atrasada; tarefa ativa não pode ser assumida por outro agente/tarefa/branch. Se houver `.lock`, inspecione o processo e o estado antes de qualquer intervenção. Falha depois do rename pode deixar estado persistido apesar do erro: releia a revisão; não repita cegamente.

Este protocolo coordena escritores cooperantes que usam o helper. Não impede edição direta por IDE ou processo com a mesma conta, nem coordena branches divergentes automaticamente. Markdown continua com escritor serializado e revisão Git. Não é autenticação de identidade de provedor. O helper não executa Git commit/push nem autoriza ferramentas. Durabilidade de diretório exercitada no macOS local; Windows nativo pendente.
