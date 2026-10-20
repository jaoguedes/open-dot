# FASE ZERO — baseline Open Dot 2.0

Data: 20/10/2026. Tarefa: OD2-P0. Baseline recuperável: `9e33c3bb44844e8d821a3664db8f4aae9f448878`, branch `codex/runner-safe-edit-beta`. Árvore limpa na entrada; quatro commits documentais locais preservados, main e backup intactos. Um worktree registrado deste repositório, sem outro executor ativo. Sem reset, stash, clean, rebase ou push. Trabalho nesta cópia de desenvolvimento continua sequencial; paralelismo permanece bloqueado até leases/worktrees por tarefa implementados.

## Entradas lidas integralmente

PDF anexado (11 páginas), PDF interno (11 páginas), Blueprint Markdown, prompt mestre, LEIA_PRIMEIRO, template YAML de especialista e exemplo ODCP. Extraídos fora do repositório, diretório temporário 0700; não executados como scripts. Textos extraídos dos dois PDFs idênticos, arquivos binários diferentes. Página 3 também renderizada/inspecionada para conferir estrutura.

- PDF anexado SHA-256: `bc50008cad09b4f995acc044c6d048927371cd530da8c2c270a9f977abb59a22`.
- ZIP SHA-256: `1119900d8fb502ca6d66a7c031187435d3335f28e8648aa9e421636f23c19bbd`.
- O prompt mestre guia as fases; instruções diretas atuais prevalecem. Publicação, push sem aprovação, custos e redesign não autorizados.

## Arquitetura inspecionada

| Área | Implementação / prova |
|---|---|
| Web/PWA | React 19, TypeScript, esbuild; `apps/web/src/App.tsx`, Workspace/Runner lazy; `RunnerWorkspace.tsx` consulta API de tarefas/aprovação. Notas locais não são memória de projeto sincronizada |
| Control plane | Worker TypeScript, roteador em `apps/worker/src/app.ts`; auth de dono e CSRF; `runner/routes.ts` usa bearer nativo separado, hashes de token e AES-GCM/AAD |
| Dados | SQLite local e adaptador Hrana/Turso, migrações expansivas até `0008`; schema remoto não consultado/modificado nesta fase |
| Núcleo | `packages/core`: políticas/contratos/runs/aprovações/IA e motor do Dot. Sem task DAG, ledger de projeto ou scheduler multiagente integrado |
| Runner | Tauri 2/Rust, canal/cofre, diagnóstico, processo limitado, worktree, Codex app-server e journal. Modelo gera proposta, host escreve após aprovação; sem shell/testes de projeto |
| Segurança | Frontend nativo empacotado, CSP/IPC restritos, diretórios canônicos, permissões locais, single instance, perfil oficial comprovado por canários. Worktree não equivale a sandbox |
| CI | Checks gerais e Runner CI; matriz DMG x64/ARM64 e NSIS Windows. Builds anteriores testam `504c00d`, não alterações futuras |
| Configuração | Arquivos locais de configuração/banco existem e não são versionados. Valores não foram abertos. Remoto HTTPS sem credencial na URL; repositório privado confirmado por API |
| Licença | Projeto UNLICENSED/proprietário; objetivo open source não altera a licença. Sem decisão jurídica ou auditoria completa de dependências |

## Testes reexecutados antes de mudanças

`npm run check`: PASS, 279 Node, sete Python, avaliação sintética Correio, typecheck e build; aproximadamente um minuto. JavaScript inicial 354,9 KB (teto 400 KB; meta 350 KB excedida). Log local descartável `open-dot-2-baseline-check.log`; sem conteúdo privado no relatório.

Teste real Codex anterior foi conferido no código e relatório: mecanismo real, API/SQLite/Keychain e edição isolada. Não repetido ainda nesta fase; não prova idea→plan→task→test→review nem GUI completa. Builds/GUI/contas não inferidos de telas. Relatório anterior preservado em `docs/agent-workspace/RESULTADO_OPERACIONAL.md`.

## Preparação de sincronização

Remoto privado confirmado; branch remota em `504c00d`, HEAD local `9e33c3b`, fast-forward possível na consulta inicial. Dez arquivos de diferença, quatro commits documentais. Scanner aplicado às versões dos arquivos em cada commit local: zero padrões de segredo. Há nomes de mantenedor e referências locais em documentação histórica: isso não é autorização para publicação nem garantia DLP. Auditoria integral de histórico/dados pessoais continua pendente antes de exposição pública. Nenhum push executado; solicitar autorização para o HEAD exato após consolidar o checkpoint e revalidar a referência remota. Não incluir logs/inputs/instaladores no Git.

## Lacunas confirmadas

Reserva remota antes de salvar journal pode deixar tarefa órfã; falta ensaio de kill/restart. Worktrees são detached de HEAD, não branches de checkpoint. Não há commits automáticos, lease entre mecanismos, execução controlada de testes ou transporte de memória/Passport integrado. Documentação antiga de segurança contém estados ultrapassados, apesar do aviso histórico; precisa de versão atual coerente. Veja RISK_REGISTER e FEATURE_MATRIX.
