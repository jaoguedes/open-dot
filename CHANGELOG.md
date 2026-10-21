# Changelog

Feito a partir dos commits (`git log`). Datas em 2026. O efeito para quem usa vem primeiro.

## v0.2 (não publicado) — motor de orquestração (21/10/2026)

- Fechamento: contato público nos documentos de segurança/licença; heurística de risco não trata mais qualquer menção a “arquivo” como risco e reconhece automação; Gemini com cotas gratuitas publicadas (fonte e data); visitantes sem erros 401 no boot e ⌘K abre na hora; PRs bem-vindos para análise (merge só com revisão, CI verde e aceite do CLA); textos jurídicos marcados como modelo sem revisão.
- Catálogo de ferramentas com fonte e data por fato; detector no Runner (só comandos públicos dos CLIs, sem ler credenciais); snapshot sem credenciais no Worker (migração 0018).
- Biblioteca de agentes como dados, com carregador que recusa permissões e injeção; cinco especialistas densos com rubricas, esquemas e avaliações.
- Seletor explicável: restrições duras, pontuação neutra, revisor diferente do implementador, modo uma ferramenta, troca manual, estimativa de chamadas; cota diária com limite aprendido por erro.
- Pipeline sequencial com papéis só leitura validados por esquema e implementador com aprovação do conteúdo exato; Claude Code opt-in com aviso e parada em limite de uso.
- Tela Equipe; avaliação golden simulada (motor × padrão simples) com leitura honesta.
- Rust compilado e testado pela primeira vez nesta máquina (34 testes); recuperação integrada passou.

## v0.1.0-beta (rascunho, não publicado) — auditoria independente e preparação open source (20/10/2026)

- Segurança: o início do login deixou de revelar o e-mail do dono; limite de taxa por origem no pareamento e no login (migração 0017); identidade fixada no modo só e-mail; HSTS; Git do Runner sem configuração global; retenção de 90 dias para conteúdo de tarefas do Runner.
- Configuração segura para quem clona: `wrangler.jsonc` só com placeholders, origem real em `.deploy.local.json` ignorado.
- CI: actions por SHA, sem credencial persistida, sem código de fork nos runners nativos, Dependabot, `cargo audit` opt-in, prova sem o Dot.
- Privacidade: varredura de segredos e dados pessoais (árvore, preparado e histórico), endereços de teste em domínios reservados, identificadores do mantenedor fora dos arquivos atuais.
- Licenças: AGPL-3.0-only + licença comercial + CLA; Dot com licença só de visualização; Marcador para forks; SPDX em todos os arquivos de código; SBOM.
- Runner: driver Claude Code somente-proposta (experimental, desligado, não validado com o CLI real); Cursor marcado indisponível.

## Não publicado — remediação Open Dot 2.0 (20/10/2026)

- Cancelamento solicitado, parada confirmada e efeitos incertos separados; lease/teto evitam tarefas eternas e recibos tardios não reabrem execução.
- Protocolo/capacidades negociados; disconnect confirma revogação remota ou mantém pending explícito. Consentimento separado antes de metadata Git, ownership e revisão dos bytes exatos/diff.
- Recuperação parcial e limite de 8 KB corrigidos; fsync Unix e leitura limitada. Codex real aprovado no Workspace com núcleo nativo; GUI nativa completa continua pendente.
- Memória cifrada no Workspace com consentimento, CAS, retenção, export memory-only e forget; user-provided não significa user-approved. Exclusão de conta inclui dados Runner/memória.
- Sem shell/testes de projeto, paralelo, novo provider, deploy/release/push ou instaladores atualizados. Evidências e limites em docs/audit/REMEDIATION_REPORT.md.

## Não publicado — execução operacional (20/10/2026)

- Codex macOS validado com tarefa real: pareamento/cofre, projeto Git autorizado, proposta estruturada somente leitura, aprovação exata e escrita em worktree; pasta original preservada.
- Reconexão, heartbeat/revogação, fila/eventos cifrados, CAS, journal e recuperação de proposta sem repetir o modelo. Shell/testes de projeto, Claude/Cursor e executor Windows ainda indisponíveis.
- Workspace mostra conteúdo antes da aprovação; Dot e paleta aprovados preservados. Sem release/deploy por orientação atual.

## Não publicado — Paleta definitiva (19/10/2026)

- Identidades de mecanismos: Codex roxo #8878EE, Claude Code coral #E99A69, Cursor azul-claro #69A9DE, somente na UI. Verde reservado ao futuro WhatsApp.
- Dot/orquestrador preserva gradiente e arte originais em todos os estados, sem tingimento adicional. Nenhuma nova skin ou peça. Cartões compartilhados no Workspace e Runner, com drivers indisponíveis explicitamente rotulados.
- Teste visual cobre os nove estados e as três cores computadas; identidade registrada em D-024 e PALETA_APROVADA.md.

## Não publicado — Runner 0.1.0 (19/10/2026)

- Auditoria do repositório e leitura integral do brief, prompt mestre e kit anexados antes da implementação.
- Workspace aditivo com Dot original em destaque, contatos de agentes, consultas ao Dot com fontes, histórico do servidor, aprovações e notas/tarefas locais.
- Resumos do Correio com fato, motivo por categoria e próxima ação; evidências, feedback e abertura do Gmail preservados.
- Base Tauri 2/Rust com onboarding, diagnóstico nativo, escolha/revogação de pastas, auditoria e tray; frontend independente sem API ou service worker embutidos.
- CI e instaladores DMG Intel/Apple Silicon e NSIS Windows x64, checksums e draft somente por ação explícita. Builds nativos dependem de opt-in do repositório. Nenhuma publicação nesta sessão.
- Pareamento, drivers, execução local de agentes, cofre de tokens e autostart permanecem planejados e identificados como indisponíveis.

## Rodada 3 — 15/10

### Correções (fase A)
- Botão Voltar em toda tela de agente e de aprovação; faixa de agentes para trocar sem passar por Meu dia; “Não achei essa página” e “Endereço inválido” no lugar de tela preta.
- Erro antigo deixa de pintar o agente de vermelho (`stale_run` > 30 min); itens “Precisa de você” com Feito e Adiar; incidente e CI fecham sozinhos quando voltam; contagem soma e-mails e incidentes.
- Site publicado nunca entra em demonstração sozinho quando a API falha.
- Notícias: CDATA, entidades, Atom, RSS 0.91/1.0, link real da Folha, ordem por data, rotação que alcança todos os feeds.
- Mercado: CoinGecko com User-Agent; ações da B3 avisadas como fora do plano, sem contar como falha; cotações no máximo a cada 15 min.
- O tique do cron não cai por inteiro quando um passo falha.
- Rollback para um Worker antigo não derruba o health nem o cron (schema igual ou mais novo é aceito).
- API devolve 400/503 em JSON no lugar da página 1101; login explica os erros de retorno do Google.
- Textos: nada de `[object Object]`, “Fonte: motivo”, sem provedores pagos na tela, “Copiar código”.
- Polling com falha vira faixa “desatualizado”; o Dot de erro só aparece por ação sua.

### Segurança e privacidade (fase B)
- Health público só diz `{ok}`; contato público configurável; `APP_ENV` padrão `production`.
- Cookie `__Host-` em produção, token novo a cada entrada, “Sair de todos os aparelhos” e lista de sessões.
- Nome e domínio vêm de configuração (`OWNER_NAME`, `APP_ORIGIN`).
- Todo log e erro gravado passa por limpeza de token, e-mail e cabeçalho Authorization.

### Desempenho (fase C)
- Uma requisição (`/api/snapshot`, com 304) no lugar de dez; atualiza só com a aba visível.
- Banco com timeout de 8 s e uma nova tentativa só para leitura.
- Cache longo para chunks e sons; fonte ou som inexistente vira 404.
- Splash só na primeira abertura da sessão; primeira tela baixa 345 KB em vez de 388.

### Interface e acessibilidade (fase D)
- Uma busca que navega e pergunta ao Dot; Central do Dot no sino; feed com “Mostrar mais” e datas com dia.
- Diálogos com foco preso e fundo inerte; contraste 4,5:1 nos dois temas; texto mínimo de 12 px; alvos de 44 px.
- Caixa de perguntas que respeita o toque; datas no fuso do dono.
- Ícones com o Dot atual (sem o tracinho fora da absorção) e maskable dentro da zona segura.

### Registro de agentes, fila de aprovações e sons (fase E)
- Registro único de agentes; fila de aprovações “1 de N”; conflito de aprovação explicado; desempate do Dot documentado (`docs/DOT_COMPORTAMENTO.md`); “Dispensar” no erro; progresso real na ilha; pílulas de fonte.
- Sons do Dot, desligados por padrão (ver Mascote).

## Rodada 2 — 15/10
- Deploy só depois do build, do check e do celular; cache do service worker com o hash do build (fim da tela preta no Safari); aviso de nova versão.
- Dot de erro com dicionário em português; código de causa no 500.
- Notícias e cotações gravadas em lote (cabem nas 50 subrequisições).
- Entregas com PacoteVício desligado até chave e termos; resumo do Correio em JSON; abrir no Gmail.

## MVP — 13 e 14/10
- Base: núcleo, Worker (API + cron), Turso via HTTP, Gmail só leitura, interface, pipeline do Dot no Blender.
- Dot em código (motor SVG, D-014), tema escuro, telas 01–05, PWA.
- Absorção de arquivos no navegador; aprovações com hash e compare-and-set; camada de IA com provedor falso.
- Agentes Notícias, Mercado e Marketing só leitura.
