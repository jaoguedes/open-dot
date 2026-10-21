# Histórico de progresso

> **Documento histórico (anterior à auditoria de 20/10/2026).** Pode contradizer o estado atual (licença, drivers, privacidade). Estado vigente: `README.md`, `docs/STATUS.md` e `docs/audit/CLAUDE_FINAL_REPORT.md`.

## 13/10/2026 · Sessão 1

**Inventário**
- Mac Intel (x64) com Blender 4.5.14, Cursor, VS Code e Claude instalados.
- Outros projetos do mantenedor já existiam no Mac. Nenhum foi alterado.
- A memória RAM do Mac não pôde ser lida: o shell remoto é uma VM Linux.
- Rede de pacotes bloqueada na sessão.

**PDF**
- Leitura completa (70 páginas, 9 imagens).
- 46 pontos revisados, com fonte oficial conferida.
- Correções principais: tracinho de absorção preservado, Queues fora do MVP, app OAuth publicado para evitar a expiração semanal do token, banco Turso separado e camadas de clipes body/face.

**Repositório**
- `~/open-dot` criado com regras, documentação e scripts.

**Fatias entregues**
- Núcleo com 45 testes.
- Worker com 18 testes de integração.
- Cliente Turso com 4 testes.
- Interface com 36 verificações no navegador.
- Pipeline Blender com validador (5 testes).

**Próximo**
- Rodar o pipeline Blender no Mac.
- Configurar as contas reais.
