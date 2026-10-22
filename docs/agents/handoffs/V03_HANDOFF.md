# Handoff do v0.3 — Claude Code

Branch `claude/od2-v03`, criada de `release/v0.2` em `69c5769226319a33f79c7f3e6419bc98afd92611`. Nada publicado: sem push, merge, tag, release, deploy ou migração remota.

## Fase atual

Ver a tabela “Progresso” abaixo; o SHA vigente sai de `git log -1 --format=%H claude/od2-v03`.

## Progresso

| Fase | Estado |
|---|---|
| 0 Preparação | feita: branch, linha de base (394 Node, 7 Python, 356 KB), medição de desempenho (`docs/performance/BASE_V03.md`), referência do Runner copiada |
| 1 Design e Dot | feita: `tint` e reações no motor com golden; tokens, fontes, componentes base, `docs/DESIGN.md`, D-027/D-028 |
| 3 Agentes e motor (1) | feita: Arquitetura, Segurança, Documentação; calibração (desligada); ciclo Corretor (desligado); 6 receitas; sugestão de skill (desligada); migração 0019; golden 28 casos |
| 2 Casca do app | feita: trilho 84 px, barra inferior, topo |
| 4 Telas | feita: Workspace, Central do Runner, Aprovações (hash real), Conexões, Equipe; mobile 1º cartão 663 px |
| 4B Runner companheiro | feita: central com abas, bandeja+painel, saúde/proteção, processos próprios, perfis/recuo, atualização (sem chave real), docs de release; pareamento por código mantido (já era código de uso único); notificações só para aprovação pendente |
| 5 Correio e Notícias | feita |
| 6 Agentes e motor (2) | feita: H, pacotes, sandbox (bloqueado), paralelismo (desligado) |
| 7 Site e mobile | feita |
| 8 Avaliação, docs, relatório | feita; gate completo registrado |

## Comandos para retomar

```
git switch claude/od2-v03 && git status --short && git log --oneline -15
npm run check
node scripts/perf/measure-runner.mjs --seconds 60   # depois de cargo build --release --locked
```

## Decisões tomadas sozinho

1. **ID de rollback do Worker:** a mudança local em `docs/STATUS.md` trocava `[ID de versão REDIGIDO]` pelo valor real. O prompt mandava comitá-la; fiz o commit `613b607`, mas o scanner de segredos a barra. Como não posso reescrever o histórico (o pedido de desfazer o commit local foi negado pelo ambiente), redigi de novo num commit seguinte (`9ae8406`) e guardei o valor em `docs/privado/STATUS_rollback_id_21-10.diff` (ignorado pelo Git). **O valor continua no histórico local de `613b607`**: antes de qualquer push, o João decide se reescreve esse commit (ele nunca foi compartilhado).
2. **Referência do app (8 telas):** não existe no repositório nem no material entregue; só a do Runner (6 telas + 8 SVGs). Telas do app seguem as descrições do prompt e a linguagem da referência do Runner.
3. **Cores de agente:** os tokens do v0.3 (Codex `#A48BFF`, Claude Code `#FF9A55`, Cursor `#62AAFF`) substituem os do D-024 no visual, registrado no D-027. Foco ganhou `#F28FD0`.
4. **Verde de Aprovar:** `#1C834E` em vez de `#1F8F55` (AA com texto branco).
5. **Acento amarelo (D-023) mantido** como acento da marca e foco; o redesign não fala dele.
6. **Alegria leve do Dot:** usa o repouso existente, sem parâmetro novo (a regra proíbe elemento novo).
8. **Consentimento da sugestão de skill:** frase própria (`aprender-com-minhas-decisoes`) em vez do fluxo de consentimento da memória, porque a sugestão não grava memória do projeto; as propostas ficam em tabela própria e “esquecer” apaga o conteúdo.
9. **Rascunhos de skill** vêm de modelos fixos escritos no código, nunca de texto do usuário, para não plantar instruções persistentes.
10. **Migração 0019** concentra tudo do v0.3 (como a 0018 no v0.2); `REQUIRED_SCHEMA` passa a `0019`: em produção, aplicar a migração antes do código.
11. **CI sem secrets:** o teste `workflow-policy` proíbe `secrets.`; não abri exceção. O build do CI desliga os artefatos do updater e o rascunho de release falha enquanto a chave pública for provisória (`runner-chave-de-assinatura.md`).
12. **Endpoint de atualização:** release-canal `runner-canal-beta` (não rascunho, não pré-lançamento), porque `latest` ignora pré-lançamentos.
13. **Tetos de quadros:** Leve 10, Equilibrado 24, Máximo 60 (a referência citava 30 no Leve); medido que 15 qps ainda custava 53% de CPU nesta máquina.
14. **Pareamento:** o fluxo atual já é por código de uso único com validade; a troca por código de 6 dígitos mudaria a autenticação, então ficou como proposta (`docs/open-dot-runner-security.md` intacto).
15. **Trailer de commit:** usei `Task: v0.3 fase N` até perceber, no gate, que a política exige `Task: OD2-…`; a partir de `4328528` uso `Task: OD2-V03`. Não reescrevi o histórico.
16. **Correio:** a ferramenta `gmail.draft` saiu do perfil do Correio (nunca foi implementada e contraria “o Dot nunca responde”).
17. **Busca no celular:** botão de ícone no topo, porque a barra inferior de 4 itens não tem busca.
7. **Fontes:** Plus Jakarta Sans em 3 pesos (400, 600, 800) para conter o tamanho; 500 e 700 caem nos vizinhos.

## Bloqueios

- Publicação, migrações e chave do updater dependem do João (ver `docs/audit/V03_PUBLISH_READINESS.md`).
- Resolvido na publicação: `613b607` foi removido do histórico local por rebase autorizado pelo João (backup local `backup/od2-v03-antes-da-reescrita`, nunca enviar).

## Próximo passo

O João revisa `docs/audit/V03_REPORT.md`. Para continuar o trabalho: ligar notificações restantes, análise de e-mail pelo Codex em modo leitura fora de projeto, e medir calibração/ciclo com chamadas reais.
