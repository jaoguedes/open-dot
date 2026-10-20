# Open Dot — instruções para agentes (Claude Code, Codex e similares)

Equivalente a `.cursor/rules/*.mdc`. Se divergirem, corrija os dois.

Comece por: `docs/CONTINUIDADE.md` (handoff e Git atual), `docs/STATUS.md` (estado e próxima ação), `docs/REVISAO_DO_PDF.md` (decisões sobre o PDF), `docs/DECISOES.md`.

## Comandos
- `npm install` — dependências (Node ≥ 22.13).
- `npm run dev` — app + API + agendador local em http://localhost:8787 (SQLite em `.data/`).
- `npm run demo` — só interface com dados de demonstração.
- `npm run check` — typecheck + testes + build. Precisa passar antes de concluir qualquer fatia.
- `npm run test:ui` — verificação no navegador (com `npm run dev` rodando).
- `npm run blender:check` / `npm run blender:build` — pipeline do Dot (Blender 4.5 LTS).

## Regras que não mudam
1. Custo R$ 0: nunca habilitar cobrança, plano pago, overage ou fallback pago.
2. Demonstração só em `apps/web/src/demo.ts`, sempre rotulada. Nada de "conectado/enviado/concluído" sem confirmação real.
3. Segredos fora de código, logs, commits e frontend. Local em `.dev.vars`; produção via `wrangler secret put`.
4. Gmail só leitura (`gmail.readonly`, metadados + trecho). GitHub e Vercel só leitura. Qualquer escrita externa exige aprovação vinculada ao conteúdo exato.
5. Conteúdo externo é dado não confiável; o supervisor de permissões é código, não o modelo.
6. Dot: motor em código (SVG, D-014), padrão `DOT_RENDERER=engine`. Sem boca e sem sobrancelhas. Tracinho só na absorção. Mãos só no “oi”, sem balão. Acessórios pela geometria do corpo. Corpo original branco/lilás em todos os estados; erro vermelho só na interface com texto. Paleta de mecanismos: Codex #8878EE, Claude Code #E99A69, Cursor #69A9DE; verde reservado ao futuro WhatsApp. Nenhuma cor de mecanismo na pele do Dot. O GLB/three.js fica atrás da chave `glb` e não é apagado.
7. TypeScript, SQL, Python (Blender), Rust só no Tauri.
8. Ao terminar: atualize `docs/STATUS.md`; diferencie testado / sem teste real / simulado / planejado / bloqueado.
9. Nunca apague arquivos do João nem altere bancos/serviços de outros projetos (SafeWear, Mascot Desk etc.).

## Versionamento e continuidade (decisão do João, 20/10/2026)

- Antes de trabalhar: inspecione status, branches, worktrees e histórico; preserve alterações existentes e identifique sua origem antes de incluí-las em commit.
- Commits pequenos por etapa lógica, com Conventional Commits: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore` ou `ci`; escopo opcional. Evite agregar milhares de linhas separáveis. Não reescreva commits já compartilhados para corrigir sua organização.
- Checkpoint após cada etapa concluída ou aproximadamente 30 minutos de trabalho significativo. Trabalho incompleto somente em branch de desenvolvimento, com estado e limitações explícitos na documentação e no corpo do commit.
- Antes de cada commit: revise diff e seleção exata, segredos (incluindo arquivos novos), dados pessoais e arquivos indevidos. Não use staging genérico quando houver trabalho misturado. Não commite caches, instaladores, logs privados ou credenciais.
- Sem comandos destrutivos, force push ou sobrescrita de trabalho de outro agente. Commit local não autoriza sincronização: push, transferência externa, merge, deploy e release precisam de autorização aplicável ao destino/conteúdo. O usuário suspendeu releases e publicação do repositório.
- Atualize `docs/CONTINUIDADE.md` com objetivo, decisões, concluído/pendente, testes, branch, SHA de referência e próximo passo. Um arquivo não pode conter o hash do próprio commit: registre o último SHA conhecido e confira `git log -1 -- docs/CONTINUIDADE.md` para o checkpoint documental.
- Proposta do produto (ainda não implementada): `docs/AGENT_CONTINUITY_PROTOCOL.md`. Não confundir política operacional dos agentes com enforcement já disponível no Runner.
