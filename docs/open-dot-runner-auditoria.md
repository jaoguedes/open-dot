# Auditoria Open Dot Runner — 19/10/2026

Base inspecionada: commit `5db4564`, árvore inicialmente limpa. Auditoria somente leitura realizada antes de alterar código. Anexos lidos: PDF externo (3 páginas), prompt mestre externo e todos os cinco arquivos do ZIP (incluindo PDF e prompt duplicados). Não existem três briefs independentes: o terceiro anexo é o prompt, e o ZIP repete o contexto. Nenhuma referência visual contém imagem de outro produto; são princípios escritos.

## Entendimento e conflitos

Preservar o produto, destacar o Dot original, criar Workspace aditivo e Runner Tauri 2/Rust, preparar DMG x64/ARM64 e NSIS x64. O pedido atual proíbe deploy/publicação: prevalece sobre a publicação sugerida no kit. Releases ficam em draft mediante acionamento explícito. O prompt permite mocks; as regras locais exigem dados fictícios exclusivamente em `demo.ts`. O Workspace usa snapshot e API atuais; nenhum driver é fingido. Não mudar geometria/expressões do Dot para satisfazer a menção genérica a olhos grandes. Motor SVG D-014 e GLB opcional permanecem.

## Mapa do projeto e evidências

| Área | Implementação atual | Proposta |
|---|---|---|
| Stack | Node 24 local (mínimo 22.13), TypeScript, React 19, esbuild; package/lock únicos | Mesmos build e componentes, sem migração de framework |
| Interface | `apps/web/src/App.tsx`: Meu dia, agentes, Entregas, Rotinas, Conexões, Mascote, aprovações, Sobre e Privacidade | Acrescentar `/workspace` e `/runner` sem substituir rotas |
| Estado | `store.tsx`: Context/hooks, snapshot com ETag, polling em aba visível, preferências locais, demo sob demanda | Consumir mesma fonte de verdade |
| Visual | `theme.css`, `styles.css`, fontes locais, temas claro/escuro, movimento/transparência reduzidos | Layout lista/detalhe, Dot anfitrião usando AgentDot existente |
| Mascote | `packages/core/src/dot` física/geometria; `apps/web/src/dot` SVG e ticker compartilhado; GLB lazy opcional | Reuso direto, sem novo desenho ou dependência 3D |
| API | `apps/worker/src/app.ts`, `jobs.ts`, serviços; dev Node/SQLite separado de workerd | Runner não substitui cron remoto |
| Persistência | SQLite local e Turso/Hrana remoto, tabelas od_, migrações aditivas; AES-GCM com AAD | Configuração Runner separada, nenhuma migração de produção |
| Sessão | Google OIDC/PKCE/state/nonce, dono único, cookie HttpOnly; CSRF header+Origin | Não reutilizar cookies no desktop nem habilitar CORS amplo |
| Integrações | Gmail metadata/snippet readonly, GitHub HMAC, Vercel readonly, RSS allowlist, mercado, GSC, entregas opt-in, Groq privado condicionado | Preservar limites/flags e estados de configuração |
| Aprovações | `approvals.ts` hash exato, versão/CAS, expiração/dono; Gmail envio falso | Reusar tela real, não converter aprovação em shell |
| Segurança | anti-SSRF, budget atômico, conteúdo externo não confiável, validação de evidência, retenção | IPC local mínimo; sem servidor localhost nem shell |
| Build | `scripts/build.mjs`, PWA, bundle Worker neutral sem Node, budget inicial 400 KB | Build Runner independente sem SW, API ou serviços embutidos |
| Qualidade | check, lint, scan, UI com Playwright/axe, avaliação sintética, workerd | Acrescentar casos Workspace/Runner e matriz nativa |

## Respostas arquiteturais

Workspace nasce dentro do app: já há conversa por regras, execuções e aprovações. Projetos/tarefas são organização local explicitamente rotulada, não orquestração. Runner nasce em `apps/runner` com assets próprios e Dot compartilhado. Comunicação futura: canal autenticado iniciado pelo Runner, desafio de uso único/expiração, vínculo por dispositivo, armazenamento de token no cofre do SO, revogação; não abrir porta HTTP acessível a páginas arbitrárias. Nesta etapa não há backend de pareamento, nem token a armazenar: ação fica indisponível com motivo.

Fechar janela mantém processo no tray; menu permite reabrir/sair. Isso não executa tarefas com o computador desligado. Drivers Codex/Claude/Cursor e autostart ficam planejados; nenhum executável é detectado por mera suposição. Sem API própria é possível verificar SO/arquitetura, selecionar/revogar pastas via diálogo nativo, persistir permissões e registrar eventos sem conteúdo.

## Validação inicial e limitações

`npm run check`: PASS, 266 testes, 7 testes Python, avaliação sintética Correio e build. Primeira tela 354 KB: acima da meta informativa 350 KB, abaixo do teto 400 KB. Sem Cargo/Rust no PATH. Não foi acessada produção, credencial, banco remoto ou conta externa. Auditoria de código e testes não equivale a pentest, medição Cloudflare, OAuth real nem aprovação artística. STATUS tem pendências antigas (3D/upload já implementados), versões e schemas históricos divergentes; conservar histórico e adicionar estado desta sessão.
