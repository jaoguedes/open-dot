# Memória compartilhada dos agentes

Entrada operacional: [PROJECT_STATE.md](PROJECT_STATE.md). Código e Git prevalecem sobre relatos históricos. Um único escritor nesta branch; outro agente deve abrir sua própria branch/worktree e registrar handoff, sem sobrescrever este estado. Checkpoints do produto usam CAS; Markdown não possui bloqueio distribuído.

Leia o estado, confira Git, reproduza evidências relevantes e retome a primeira tarefa elegível. Transferência de contexto nunca transfere credenciais ou permissões.
