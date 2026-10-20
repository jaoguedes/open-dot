# Open Dot 2.0 — checkpoint local de 20/10/2026

FASE ZERO e primeira fatia implementadas sobre `9e33c3b`, sem reiniciar ou redesenhar. Ler [handoff vigente](AGENT_HANDOFF.md) e [relatório detalhado para auditoria](audit/IMPLEMENTATION_REPORT.md). Estado histórico abaixo preservado.

- Runner: reservas sem journal reconciliadas sem repetir modelo/escrita; kill/restart real de aplicação aprovada testado; orçamento de progresso reserva recibo terminal. Legado já saturado em 500 eventos ainda exige revisão específica.
- Codex real revalidado separadamente; crash usa proposta sintética identificada. GUI completa e crash durante geração ainda não comprovados. Shell/testes de projeto continuam desabilitados.
- Base nova: ledger cifrado CAS/Memory Graph e Passport `memory-only` com persistência SQLite reaberta; dez Expert Contracts e contratos/checklist/tempo ODCP. Sem API/UI de memória, timer persistente, commits/leases automáticos ou handoff automático.
- Gate: **287 Node, sete Python, onze Rust, sete UI**, mais ensaios Codex e crash reais separados; lint sem erros/aviso preexistente. Scanner inclui arquivos novos; limites no relatório.
- Migração 0009 aditiva só em bancos descartáveis. Nenhuma migração remota, push, deploy, release ou gasto. Builds antigos são de 504c00d, não deste código. Sincronização privada aguarda autorização explícita. Revisão Claude e Cursor ainda pendentes.

---

# Continuação operacional — 20/10/2026

**Fluxo real do Codex PASS no Mac Intel.** CLI oficial autenticado com ChatGPT → API/SQLite local isolada → pareamento no Keychain → projeto Git autorizado → proposta real do modelo → aprovação do conteúdo exato → gravação em worktree → eventos e conclusão. Revalidado em 20/10; pasta original intacta. É teste programático do núcleo nativo, não E2E completo da interface gráfica ou OAuth Google.

Codex oferece um modo inicial limitado: até oito arquivos/8 KB por proposta, somente leitura pelo modelo, sem shell, MCP ou testes de projeto. O host aplica os conteúdos aprovados. Não há merge/commit/push automático. Perfis oficiais experimentais exigem prova local de isolamento antes de habilitar o driver; versão incompatível falha fechada. Claude detectado sem login e Cursor ausente: ambos sem execução implementada. Windows não anuncia executor habilitado.

Pareamento, cofre, heartbeat, revogação, fila/eventos cifrados, CAS, aprovação por hash e uso único, worktree sem hooks/filtros e journal de recuperação implementados. Proposta confirmada pode ser recuperada sem nova chamada ao modelo; geração interrompida não é repetida automaticamente. Retomada após falha parcial de escrita possui teste unitário; recuperação completa após encerramento abrupto ainda exige ensaio integrado dedicado.

Dot original e paleta aprovados preservados. Workspace inclui seleção de computador/projeto, prompt, eventos, conteúdo proposto e aprovação/rejeição. Notas locais e conversa existentes mantidas.

Verificações atuais: check completo PASS (279 testes Node/TypeScript, avaliação sintética Correio, sete testes Python, typecheck/build). Lint sem erros e um aviso preexistente de hook em DotView. Seis cenários anteriores de UI passaram; novo W5 de aprovação também passou separadamente com API simulada. DMG Intel debug atualizado, hdiutil VALID, 12,11 MiB; hash no guia de instaladores. Rust: dez unitários passaram, incluindo retomada parcial de escrita; dois testes nativos são ignorados por padrão. O fluxo real Codex passou separadamente. Varredura de 448 arquivos rastreados e novos: zero ocorrências de segredo. Consulte [relatório operacional](agent-workspace/RESULTADO_OPERACIONAL.md) para a evidência final.

**Sem publicação por orientação atual do João.** GitHub autenticado; diagnóstico anterior de token inválido foi causado pela restrição de rede do sandbox. João confirmou orçamento US$ 0 e bloqueio de uso pago. Builds Actions podem ser executados nesse limite; nenhuma cobrança autorizada. Sem deploy, release, tag ou migração remota. Migração expansiva `0008` existe, ainda não aplicada em produção.

## Continuidade e versionamento — 20/10/2026

Leia [CONTINUIDADE.md](CONTINUIDADE.md) antes de retomar. Política de checkpoints pequenos com Conventional Commits registrada em CLAUDE.md e regras Cursor. [Agent Continuity Protocol](AGENT_CONTINUITY_PROTOCOL.md) é uma proposta, sem enforcement no Runner. Branch de desenvolvimento `codex/runner-safe-edit-beta`; implementação `504c00d`, draft privado #1. Runner CI 39425600153: **SUCCESS**, verify e três builds Intel/ARM64/Windows. Dez unitários Rust por plataforma; sete cenários UI no verify. Conjunto de instaladores e SHA-256 validado; DMGs íntegros e arquiteturas conferidas. Inicialização do DMG Intel do Actions PASS por dez segundos com diretórios isolados; GUI completa, ARM64 e Windows nativos não comprovados. CI geral SUCCESS. Código dos builds: `504c00d`; checkpoints documentais posteriores permanecem locais. Sem release/deploy. Resultados/hashes no [guia de instaladores](open-dot-runner-release.md).

## Histórico das execuções anteriores

Os estados e bloqueios abaixo descrevem suas datas originais; o resumo acima prevalece para a implementação atual.

---

# STATUS — Open Dot

## Paleta definitiva — 19/10/2026 (D-024, trabalho local)

Nova decisão do João aplicada sobre a base anterior, sem reconstruir o app: [identidade aprovada](PALETA_APROVADA.md). Os quatro arquivos do novo ZIP foram lidos. Codex **#8878EE**, Claude Code **#E99A69**, Cursor **#69A9DE** apenas em cartões, indicadores e rótulos da UI. Função de agente não define mecanismo nem cor; registro separado. Verde reservado ao futuro WhatsApp como identidade, sem integração ativa; estados semânticos continuam separados.

Dot/orquestrador com gradiente branco/lilás original em todos os estados. Camadas extras de tingimento e filtro cinza desativadas na exibição SVG; tingimento desligado também no fallback 2D e GLB. Olhos, expressões, proporções, física, artDefs, geometria e assets/modelos originais preservados. Nenhuma skin, badge ou peça nova. Hosts de Meu dia e Workspace sem acessório/anel herdado da função selecionada. Preferências e acessórios legados não foram removidos. Acentos e regras documentados em CLAUDE.md, regras Cursor e DECISOES D-024.

Validação: check com **270 testes** Node/TypeScript, avaliação sintética Correio e **7 testes Python**; typecheck/build/lint sem erros (aviso preexistente de hook em DotView). **6 cenários ui:runner** passaram: W1–W4 e R1–R2; W4 confere cores computadas e ausência de tingimento/filtro nos nove estados, com gradiente original intacto. Axe claro/escuro e layouts desktop/320/390 px verificados nas telas cobertas. Capturas atualizadas em test-results/runner/. Varredura incluindo novos arquivos: **434 arquivos, zero ocorrências** de segredo. Nenhum arquivo de artDefs, assets, geometria ou modelo foi alterado.

DMG Intel debug atualizado com a revisão visual, gerado sem Xcode completo, checksum verificado com hdiutil e conteúdo montado somente leitura (versão/arquitetura/atalho conferidos), desmontado após inspeção. Hash atual no guia de instaladores. Não houve instalação/execução nativa, push, deploy, tag ou publicação. Pareamento, drivers e autostart continuam indisponíveis; as cores não indicam uma conexão real. Builds ARM/Windows e uso real de contas permanecem pendentes, conforme seção anterior. O prompt amplo do ZIP não foi tratado como nova autorização direta para publicação externa.

## Runner e Agent Workspace — 19/10/2026 (trabalho local, não publicado)

Leia [auditoria](open-dot-runner-auditoria.md), [plano](open-dot-runner-plano.md), [UX](open-dot-runner-ux.md), [segurança](open-dot-runner-security.md) e [instaladores](open-dot-runner-release.md). Todo o brief/prompt e conteúdo do ZIP foram lidos antes de alterar código. Nenhum deploy, push, tag, release, credencial ou banco remoto foi alterado. O histórico abaixo descreve sessões anteriores; não representa a validação desta sessão.

| Entrega | Estado real | Validação nesta sessão |
|---|---|---|
| Auditoria e plano | ✅ | Mapa da stack, rotas, estado, segurança, integrações, build e conflitos dos anexos |
| Workspace `/workspace` | ✅ local | Contatos com Dot original, conversa via API existente com fontes, runs/aprovações do snapshot. Contexto/checklist só no navegador, explicitamente rotulados |
| Presença do Dot | ✅ Chromium | Mesmo AgentDot, sem mudar geometria/expressões; hero do Workspace e onboarding Runner, avatares dos agentes e evidência do Correio |
| Resumo Correio | ✅ regressão simulada | Fato/motivo por categoria/próximo passo; pílula da fonte, Gmail e feedback/silenciamento preservados. Nenhum rascunho criado |
| Runner UI | ✅ Chromium | Onboarding 6 etapas, prévia web com IPC desabilitado; diagnóstico/pastas/revogação com IPC simulado em teste |
| Runner Rust/Tauri | ✅ compilação Mac Intel · 🟡 runtime | 3 testes Rust passam com lockfile, sem Xcode completo; toolchain temporário em /tmp e CLT existentes. Tray e diálogo reais ainda não exercitados manualmente |
| Instalador local Mac Intel | ✅ gerado/verificado · 🟡 instalação/runtime | `apps/runner/installers/OpenDot-Runner-macos-x64-debug.dmg`, 8,83 MiB, debug sem assinatura/notarização. hdiutil checksum VALID; montado só leitura: versão 0.1.0, bundle com.opendot.runner, binário x86_64 e atalho Applications conferidos; desmontado após inspeção |
| GitHub Actions DMG Intel/ARM + NSIS EXE | ✅ configuração · 🟡 execução GitHub | YAML válido, opt-in RUNNER_BUILDS_ENABLED, artefatos/checksums, draft opcional por dispatch e tag existente. Nenhum workflow disparado |
| Pareamento/drivers/autostart/cofre | 📋 indisponível | Não há canal autenticado ou execução de agente local. Sem token a armazenar, nenhum motor detectado por suposição |

Verificações: `npm run check` PASS (269 testes TypeScript/Node, 7 testes Python, avaliação sintética do Correio e build). `npm run lint`: zero erros, aviso preexistente em DotView sobre dependência de hook. Arquivos gerados Rust foram excluídos de lint/typecheck, mantendo todas as fontes cobertas. Cinco cenários `ui:runner` PASS (Workspace/tarefas, mobile claro, resumo com evidência, onboarding e IPC simulado), com axe sem violações sérias/críticas nas novas telas verificadas. Regressões: fase A 12/12, fase D 11/11 (inclui axe claro/escuro), fase E 5/5, fase G 4/4, rodada 4 2/2. Regressões detectadas durante a refatoração foram corrigidas antes da validação final. Screenshots em `test-results/runner/`, não versionadas. Primeira tela ~355 KB (teto 400 KB; meta informativa 350 KB ainda excedida). Varredura incluindo arquivos novos sem ocorrências de segredo.

Não testado nesta sessão: OAuth/contas reais, Cloudflare/workerd, GPU/Blender real, leitor de tela, execução de driver, instalação/desinstalação, tray/diálogo em hardware, notarização, Mac ARM e Windows nativos. Os testes de interface usam API/IPC simulados e não provam integração remota.

Próxima ação: revisar o diff e os instaladores locais disponíveis; configurar proteção do environment runner-release e franquia gratuita antes de habilitar os jobs nativos. Aprovação separada para push/tag/draft/publicação. Não habilitar cobrança/overage. Pairing/driver futuro deve seguir o contrato de segurança documentado.

_Atualizado em 15/10/2026, rodada 3 concluída (sem as auditorias) e rodada 4 (amarelo, vidro, ícones). Produção `ok:true`, schema `0007`, Worker `bbb21323-cacb-4b48-abc2-739e843ea29a`, app `046d7bc64f45` (build de `f69bc9f`, reproduzido em worktree limpo com `npm ci`). Rollback: `06234ec1-e640-4084-b501-51c8b478e0f7`. `GROQ_ZDR_CONFIRMED` e `PACOTEVICIO_TERMS_CONFIRMED` seguem `false`. Auditorias 1–3 ficam para outra sessão._

## Rodada 3 (15/10/2026)

Prova de cada item (antes → depois) em `docs/RODADA3_LOG.md`.

| Item | Estado | Validação |
|---|---|---|
| A1–A10 | ✅ | `npm run ui:fase-a` (390×844, API simulada): 0/12 no código antes das correções → 12/12. Testes unitários de A2, A3, A4–A7 |
| B1–B7 (segurança) | ✅ publicado | `apps/worker/test/fase-b.test.ts` 0/6 → 6/6 |
| C1–C5 (desempenho) | ✅ publicado | snapshot com 304, retry só de leitura, cache, splash, orçamento do bundle |
| D1–D8 (interface/a11y) | ✅ | `ui:fase-d` 0/11 → 11/11 (axe nos dois temas) |
| E1–E7 (registro, fila, sons) | ✅ (sem a escolha de agentes/cores por dono, que era opcional) | `ui:fase-e` 1/5 → 5/5; E3 no Worker 0/3 → 3/3 |
| F1–F6 (CI, lint, contratos, diagnóstico, dados) | ✅ · 🟡 CI nunca rodou no GitHub | testes da F 0/3 → 3/3; `npm run lint` 0 erros |
| G (Correio) | ✅ · 🟡 qualidade real desconhecida | `eval:correio` é só regressão (conjunto ajustado com as regras); conjunto cego vazio. `ui:fase-g` 1/4 → 4/4 |
| Contato público | ✅ editável em Conexões | `apps/worker/test/contato.test.ts`. Produção ainda mostra o Gmail pessoal (decisão do João) |
| Rodada 4 (amarelo, vidro, ícones) | ✅ publicado · 🟡 iPhone | `tests/theme-rodada4.test.ts` 2/8 → 8/8; `ui:rodada4` escuro e claro; diário em `docs/RODADA4_LOG.md` |
| Testado só em simulação | 🟡 | sons, ícones e “Abrir no Gmail” não foram testados num iPhone |

## Rodada 2 (15/10/2026)

| Item | Estado | Validação |
|---|---|---|
| Deploy com build obrigatório | ✅ script · 🟡 publicação desta rodada | `npm run deploy` faz build, `check`, `test:workerd`, `ui:mobile` e só então `wrangler deploy`. Não usar `worker:deploy` para esta publicação. |
| Tela preta / service worker | ✅ unidade + celular | Causa: cache `open-dot-shell-v1` era cache-first para sempre; o chunk com hash no nome faltava e o fallback de SPA devolvia `index.html` como se fosse JavaScript. Agora o nome do cache leva o hash do build, navegação é network-first com fallback, assets são stale-while-revalidate, e `/assets/*` e `/chunks/*` inexistentes devolvem 404 de verdade. Falha de chunk limpa o cache e recarrega uma vez. |
| Versão | ✅ | `GET /api/version` devolve o hash do app e o id do Worker, sem segredos. Se diferir da meta `open-dot-build`, a tela mostra “Nova versão disponível” e o botão “Atualizar”. |
| Dot de erro | ✅ unidade + celular 390×844 | Dicionário fixo em pt-BR (`packages/core/src/errors-pt.ts`). Sem IA. Código desconhecido diz que ainda não sabe. Detalhes passam por `sanitizeDetail`. ErrorBoundary no topo. Teste de cobertura falha se um `reason` do worker ou do app não está no dicionário. |
| Busca no celular | ✅ 390×844 | O diálogo não usa mais a classe `island` (escondida abaixo de 760 px). Classe `palette`, foco no campo, fecha ao tocar fora. |
| Notícias e subrequisições | ✅ unidade (SQLite em memória) | Causa real: cada `db.run` no Turso é uma subrequisição HTTP. Vários feeds com dezenas de itens passavam de 50. Agora o insert é um `db.batch`, no máximo 15 itens por feed, e o orçamento conta banco + HTTP com teto 44. O teste de 4 feeds × 30 itens roda em `npm test`, não no Turso de produção. |
| Execuções presas | ✅ unidade | Exceção no meio da execução marca `failed` com código. `running` parado há mais de 10 min vira `failed`. `queued` cujo horário e atualização já passaram de 10 min vira `uncertain`. Slot futuro na fila não é cancelado. |
| Erro com causa | ✅ | O 500 mantém “Algo deu errado…” e acrescenta `reason` (`subrequest_limit`, `db_error`, `upstream_timeout`, `upstream_http_NNN`, `invalid_feed`, `schema_mismatch`, `unknown`). Notícias e Mercado listam a fonte e a explicação do dicionário. |
| Celular | ✅ `ui:mobile` | 390×844: Meu dia, Rotinas, Busca, Conexões, cada agente e Entregas. Sem rolagem horizontal, sem botão coberto pela caixa de perguntas, sem erro no console. A caixa fica fixa acima do dock. |
| Estado vazio | ✅ | No máximo duas linhas e “Abrir conexões”. O texto técnico fica em “Sobre o agente e permissões”. |
| Entregas no Meu dia | ✅ demo | A pílula aparece mesmo “Não conectado”, esmaecida. Conexões mostra o cartão do PacoteVício (desligado / sem chave / termos / ligado) e o contador do mês. O provedor não foi ligado. |
| Atribuição | ✅ no bundle | Abaixo da encomenda consultada pelo PacoteVício: “Rastreamento por PacoteVício” → https://pacotevicio.dev. A URL está no cliente. O primeiro evento sintético do plano Básico não é apagado. |
| Resumo do Correio | ✅ fixtures | JSON `{abertura, itens[], sem_acao[], ruido}`. Sem IA, o motivo é uma frase (“Aviso de segurança”), nunca “Menciona 'confirme'”. Códigos de login e cartão não saem no texto. Corpo do e-mail não é persistido. |
| Abrir no Gmail | ✅ unidade · 🟡 aparelho | “Abrir no app do Gmail” usa `googlegmail://` no toque e abre a caixa de entrada, não a mensagem. “Abrir na web” usa `rfc822msgid` quando o Message-Id existe, senão `#all/<id>`. Não foi testado num iPhone. |

## Sessão autônoma 13→14/10 (em andamento)

| Fase | Estado | Validação |
|---|---|---|
| 0 · Base | ✅ | Node 24.21; `npm install` com lockfile; `npm run check` verde após corrigir um tipo no teste Hrana |
| 1 · Dot no Blender | ✅ técnico · 🟡 arte | `npm run blender:build` → validação OK. Corrigido: acessórios exportavam o Dot inteiro (sem `window` em `--background`); efeitos apareciam nos posters; tracinho invisível; EEVEE travando. Validador agora recusa peça com corpo/clipes |
| 2 · Dot 3D no app | ✅ | `npm run check` (74 testes) e `npm run test:ui` 50/50, incluindo fallback sem WebGL, movimento reduzido, perda de contexto, pausa oculta, ≤ 30 fps e repouso sob demanda |
| 3 · Absorção de arquivos | ✅ local | `npm run check` (89 testes) e `npm run test:ui` 61/61 |
| Motor SVG (D-014) | ✅ núcleo | `packages/core/src/dot`: geometria superelipse, molas 120 Hz, estados/reações do protótipo, RNG com semente. 7 testes (10 mil passos sem NaN, bloqueios, absorção m→0, ≤18 partículas, semente, `question`). `npm run check` 96/96 |
| Motor SVG · vista | ✅ arte + ticker | `apps/web/src/dot`: DotView monta o SVG uma vez e atualiza atributos por refs; arte 2D (olhos em traço, selos, partículas); acessórios por geometria (sem innerHTML por quadro); um rAF para todas as instâncias, pausa com aba oculta. 2 testes (paths sem NaN; ticker para quando oculta). `npm run check` 98/98 |
| Motor SVG · app | ✅ ligado | AgentDot no lugar do Dot2D (arquivo 2D/3D preservados). semantic → motor; success → react; anel da Sentinela só em working/thinking; carinho/poke/dizzy; absorção. Splash 1,2 s + fade 250 ms com “oi”. Build sem chunk three.js no caminho padrão. |
| Visual D-015 | ✅ tokens + shell | Tema escuro padrão (#050608). Tokens em `theme.css`. Inter + Instrument Serif itálico + JetBrains Mono locais (OFL). Shell da tela 01: nav em pílula azul, ilha preta no topo, Meu dia com saudação em serif, 3 cartões com brilho e dados reais/demo rotulados. |
| Tela 01 (correções) | ✅ unidade | `/` e `/?demo=1` = Meu dia (`aria-current`). Saudação 56–64 px / 600 / -0,045em; serif do estado real; DotView 280 px; 3 cartões com brilho; filtro Tudo / Precisa de você / Fontes. Status dos agentes: uma fonte (`presence.ts`) — âmbar / vermelho “N incidente” / azul / cinza, nunca “Em repouso” com incidente. Mini-Dots 44 px; `.lines { flex: 1 }`. Splash: “opendot” + pontinho depois. `--ask-bar` reserva a caixa de pergunta. Tema fica no grupo `.top-actions`. |
| Chapéus (livro HAT) | ✅ unidade | Copa/meridianos/sombra pelo contorno da superelipse (`hatCrown`/`hatOff`). Trabalho: boné, fone, antena, viseira, boina. Guarda-roupa: gorro de gatinho, bucket, coroa (`CROWN_UNLOCKED = false`). Antena pisca só com `antennaPulse`. Peças montadas uma vez; por quadro só `d`/transform/opacity. |
| Agentes Notícias / Mercado / Marketing (D-017) | ✅ unidade · 🟡 contas reais | Núcleo aditivo + schema `0003`. RSS allowlist (termos 14/10/2026). Cotações CoinGecko/Frankfurter/Finnhub opcional. GSC `webmasters.readonly`. Sem rota de ordem e `MARKETING_CAN_PUBLISH = false`. Testes de dedupe, política ≥ 2 veículos, feed indisponível, cotação velha, ordem 404, marketing não publica. |
| Entregas (D-018) | ✅ unidade · ⛔ provedor até a chave e os termos | Cor #C9862A. Detecção sem IA (S10/UPS/FedEx/USPS/DHL/OnTrac/Amazon). Jadlog/Loggi/Total/Shopee/J&T não são adivinhados. Cards a partir do assunto e do trecho já lidos, sem CNPJ, telefone ou e-mail. PacoteVício desligado sem `PACOTEVICIO_API_KEY` e `PACOTEVICIO_TERMS_CONFIRMED=true`. Teto 900/1000, intervalo de 6 h, entregue não é consultada. Ship24, Seu Rastreio, 17TRACK, Correios oficial e rastrojs não são chamados. |
| Fase 5 · celular + aprovação | ✅ unidade | Abaixo de 760 px: sidebar some, Dot no centro, pílulas de agentes, dock 44 px com safe-area. Tela `/aprovacao/:id`: texto exato, hash + CAS, editar gera hash novo. `GMAIL_CAN_SEND = false` — aprovar não envia. |
| Fase 6 · PWA | ✅ unidade | `manifest.webmanifest` (Open Dot / opendot / standalone / #050608), ícones 192/512 e maskable a partir do poster do Dot, `apple-touch-icon`, SW só do shell (nunca `/api`). |
| Fase 7 · GLB / desempenho | ✅ chave já existia · 🟡 GPU real | `DOT_RENDERER=engine` padrão; GLB atrás de `glb`. Medição de fps no Chromium headless (SwiftShader), não GPU real. Prints na sessão de `test:ui`. |
| Parte C · IA (D-016) | ✅ unidade · ⛔ chave Groq | Registro + `max_completion_tokens`/`reasoning_effort: low` no Groq; 402 desliga a rota. Tela de provedores com “Testar com exemplo fictício” (só provedor falso). `npm run eval:ai`: dataset v1 100 casos, recall importantes 100%, JSON 100%, zero ação não autorizada, zero segredo no resultado, zero rota paga. Sem chamada real à Groq. |

## Legenda

- ✅ implementado e testado
- 🟡 implementado, ainda sem teste real (contas reais, Blender ou Cloudflare)
- 🧪 simulado para desenvolvimento
- 📋 planejado
- ⛔ bloqueado por configuração externa

## O que existe e funciona

| Área | Estado | Detalhe |
|---|---|---|
| Revisão do PDF | ✅ | `docs/REVISAO_DO_PDF.md`: 46 pontos com página, decisão, motivo, impacto, fonte oficial (conferida em 13/10/2026) e critério de aceite |
| Repositório, regras e docs | ✅ | `.cursor/rules/*.mdc` no formato atual, `CLAUDE.md`, `AGENTS.md`, `.env.example`, decisões, licenças, guia do Cursor |
| Núcleo (`packages/core`) | ✅ | Estados de execução, resolvedor visual com prioridade e revisão, corações independentes, absorção (selecionado → enviado → recebido → organizado), agenda por fuso IANA, aprovações por hash e CAS, supervisor de ferramentas, triagem por regras, resumo com cobertura, monitor anti-SSRF, roteador de IA |
| Persistência | ✅ SQLite · ✅ Turso (Worker) | Migrações `0001`–`0005` com prefixo `od_`. `0004` acrescenta encomendas. `0005` acrescenta `od_email_messages.rfc822_id` (aditiva; aplicada no Turso em 15/10/2026). `HranaDb` não guarda o `fetch` global cru. |
| API / Worker | ✅ local (workerd) · ✅ Cloudflare | https://open-dot.jpguedesbarbieri.workers.dev (Workers Free), versão `da21bebf-d11a-4fdc-abad-c87022130c56`. `/api/health`: `ok:true`, `schema:"0005"`, `schemaError:null`, `configured.tracking:false`, `trackingState:"desligado"`. A versão imediatamente anterior, para `wrangler rollback`, é `e065a2e9-70dc-479d-9fd7-f44bf2e6cc4d` (100% em 15/10/2026 14:27 UTC). `npm run dev` não reproduz o workerd; use `npm run test:workerd`. |
| Login | ✅ start em produção · 🟡 OAuth real | `GET /api/auth/google/start` em produção redireciona para `accounts.google.com`. `redirect_uri` = `https://open-dot.jpguedesbarbieri.workers.dev/api/oauth/google/callback`. Escopos do login: `openid email` (sem `profile`). Um segundo e-mail é recusado no teste (comparação com `OWNER_EMAIL`). Nome de exibição inicial “João”, editável em Configurações da barra (`PATCH /api/profile`). Gmail `gmail.readonly` continua na conexão à parte. Entrada de desenvolvimento só em localhost. |
| Gmail (somente leitura) | 🧪 testado com Google simulado · 🟡 real | OAuth com `gmail.readonly`, sync incremental (`historyId` como texto), dedupe, ressincronização após 404, lotes dentro do limite de subrequisições, renovação de token com lease, reconexão única quando revogado, resumo das 08h/17h com links para o Gmail |
| Rotinas 08h/17h | ✅ | Chave única por slot; cron repetido não duplica; após dias offline gera um único resumo “atrasado”; mudar o horário cancela execuções futuras |
| IA | ✅ lógica + eval falso · ⛔ chave | Allowlist Groq; ZDR para privado; 402 desliga; `max_completion_tokens`. Tela de provedores. Avaliação `scripts/eval-ai.ts` no provedor falso. Sem chave, resumo por regras |
| GitHub | 🧪 webhook testado com eventos simulados · 🟡 GitHub App | Assinatura HMAC, dedupe por delivery, evento fora de ordem não regride, falha de CI vai para o feed. O token de instalação está implementado, sem teste real |
| Vercel | 🟡 | Leitura de `/v7/deployments` a cada ~15 min; deploy com ERROR vai para o feed. Sem escrita. Web Analytics Hobby: sem visitas inventadas se a API não responder |
| Notícias | ✅ unidade · 🟡 RSS reais | Allowlist RSS/Atom (BBC, NPR, Folha). Dedupe, política ≥ 2 veículos, “O mundo hoje” às 08h (máx. 3/tema). Sem scraping de paywall |
| Mercado | ✅ unidade · 🟡 APIs reais | CoinGecko + Frankfurter sem chave; Finnhub Free opcional (`setup:cloud`). Alerta no limite. Sem corretora/ordem |
| Marketing | ✅ unidade · 🟡 GSC/Vercel reais | Search Console só leitura; ideias de post = rascunho; redes sociais 📋. Não publica |
| Sites (Sentinela) | ✅ | Até 3 URLs HTTPS; bloqueio de IP interno e de redirecionamento; incidente após 3 falhas e encerramento após 2 sucessos; correlação com deploy dita como “sinal, não causa”. Atalho “Vigiar o próprio Open Dot” registra `https://open-dot.jpguedesbarbieri.workers.dev/api/health` (idempotente; respeita o limite de 3). O anel do mini-Dot da Sentinela fica visível. |
| Interface web | ✅ desktop · 🟡 arte móvel (tela 02 no núcleo) | Tema escuro (D-015). Agentes na barra: Não conectado (esmaecido, animação disconnected, ação Conectar), Em repouso, ou “N pedem você” no topo. Entregas fica Não conectado sem encomenda e sem provedor. Correio: “Revisar agora” sincroniza e revisa na hora; a ilha mostra “está lendo…” e “concluído” só depois. Notificação push do navegador não foi ampliada: o aviso de mudança de encomenda vai para o feed. |
| Dot 2D (fallback) | ✅ | Sem boca, sem sobrancelhas, **tracinho de absorção preservado**, blush, acessórios removíveis, tinta por estado, carinho suprimido em erro/aprovação, movimento reduzido. Rotulado como “2D” |
| Dot 3D (Blender) | ✅ técnico · 🟡 arte | `npm run blender:build` roda no Mac (Blender 4.5.14 LTS) e passa na validação: GLB base 164 KB, 3.500 triângulos, 19 clipes, 10 morphs dos olhos; 5 peças de 3–12 KB. Posters em `assets/dot/poster-*.png` (Cycles na CPU). **Aprovação artística pendente** (`ACOES_DO_JOAO.md`, grupo A). Validador Khronos não executado |
| Dot 3D no app | ✅ Chromium/SwiftShader · 🟡 GPU real | `Dot3D.tsx` + `dot3d/DotScene.ts`: um único canvas, clipes `body_*`/`face_*` em camadas, olhar limitado (8°/5°), tom do agente/estado pelo resolvedor, acessório no socket, corações do `HeartEmitter`, crossfade de 200 ms, ≤ 30 fps, render sob demanda em repouso, pausa com a janela oculta, fallback 2D sem WebGL, com perda de contexto e com movimento reduzido. three.js num chunk carregado só quando o 3D aparece (página Mascote) |
| Absorção de arquivos | ✅ local · 🟡 Cloudflare | Painel na conversa do Dot: arrastar ou “Escolher arquivo” (PDF com texto, TXT, MD, até 5 MB). Texto extraído **no navegador** num Web Worker (pdf.js 6, carregado só para PDF); o arquivo original não sai da máquina. Servidor confere tamanho, tipo/extensão, SHA-256 do texto, texto vazio/escaneado/longo, duplicata por dono e 30/dia; grava nome e texto cifrados (AES-GCM) e o run `file_organize` na mesma transação. “Recebido” só após o 201; “Organizado” só após o run concluir (pedido do app ou cron, com CAS — dois processamentos simultâneos = um efeito). Organização **por regras, sem IA** (título, seções, termos, tempo de leitura). Animação de entrada pelo tracinho no Dot 2D (folha descendo + brilho; com movimento reduzido só o brilho). Apagar remove texto, resultado e aviso do feed. Sem OCR: PDF escaneado é recusado com mensagem. Indisponível na demonstração |
| Desktop (Tauri) | 📋 | Fase 11 |
| Ações externas com aprovação | 📋 | O núcleo existe (hash, CAS, supervisor); faltam fluxos reais (rascunho no Gmail etc.) |

## O que foi validado e como

Ambiente: workspace Linux na nuvem, Node 22.22, TypeScript 6.0.3, esbuild 0.28.2, Chromium (Playwright), Python 3.13. A VM ligada ao Mac roda Linux e **não executa** o Blender.app.

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm test` | ✅ (núcleo + worker + presença/demo da etapa 1: Código “1 build falhou”, Sentinela “Lento”, ilha “está lendo…”) |
| `npm run test:blender` | ✅ 7/7 |
| `npm run build` | ✅ app.js 320 KB, worker 176 KB, **sem APIs do Node** |
| `npm run eval:ai` | ✅ provedor falso v1: 100 casos, recall importantes 100%, JSON 100%, unauthorized 0, paid false |
| `npm run test:ui` | ✅ 83/83 no Chromium (login, demo rotulada, Meu dia, 320/390, dock, aprovação sem envio, carinho, upload, PWA) |
| `npm run test:workerd` | ✅ `ok:true`, `schema:"0005"`, `schemaError:null` (15/10/2026, workerd local no Turso já migrado) |
| `npm run ui:mobile` | ✅ 390×844: páginas, busca, erro de render, reason, chunk e aviso de versão |
| `https://open-dot.jpguedesbarbieri.workers.dev/api/health` | ✅ `ok:true`, `schema:"0005"`, `schemaError:null`, `tracking:false` (15/10/2026, versão `da21bebf-d11a-4fdc-abad-c87022130c56`). `/api/version` bate com o app local `6b4e0f771bdb`. `/assets/inexistente` devolve 404 `text/plain`. |

Riscos cobertos por teste: isolamento por dono, CSRF, state de OAuth reaproveitado, escopo negado, acesso revogado (uma única notificação), webhook com assinatura inválida, entrega duplicada, evento fora de ordem, 429 do Gmail, falha parcial de sincronização, cursor expirado, cron repetido, lease disputado, aprovações concorrentes, orçamento concorrente (memória e SQL), 429 em provedor privado sem envio a outro, timeout e circuit breaker, cancelamento, injeção de prompt, ID de evidência inventado, prioridade visual de erro, cancelamento independente de efeitos, movimento reduzido, segredos ausentes do banco e do health.

**Não foi testado:** completar o OAuth real do Google (só o start 302), Gmail real, CPU do cron no Cloudflare (10 ms), GitHub App real, Vercel real, Groq real, Blender/GLB nesta sessão, Mac e Windows como app, leitor de tela real.

## Pendências

1. Rodar `npm run blender:build` no Mac, revisar os posters e iterar a forma e os clipes até o validador passar (relatório em `blender/out/*/build-report.json`).
2. Runtime 3D no app: three.js + `GLTFLoader`, um único canvas, fallback para o 2D sem WebGL, pausa com a janela oculta e medição de memória/CPU.
3. Contas reais (grupos B, C e D em `ACOES_DO_JOAO.md`), primeiro deploy, medição da CPU do cron e teste real do Gmail por 7 dias.
4. ~~Upload e absorção de arquivos~~ feito na sessão de 13→14/10 (testado localmente; falta rodar no Cloudflare e medir a CPU do `POST /api/uploads` com texto de 200 mil caracteres). O 3D (`body_absorb_receive`) ainda não é usado no painel, que fica fora da página Mascote (um canvas só, D-012).
5. Rascunho de resposta (`gmail.compose`) com aprovação do conteúdo exato.
6. GitHub App e token da Vercel (fase 7).
7. Fixar o lockfile com o primeiro `npm install` com rede e anexar o relatório de licenças transitivas.

## Bloqueios

- ⛔ **Contas:** Google OAuth, Cloudflare e Turso dependem de você (`docs/ACOES_DO_JOAO.md`).
- ⛔ **Rede de pacotes nesta sessão:** npm e PyPI estavam bloqueados. Não deu para instalar o Vite, o Wrangler, o three.js nem o validador da Khronos aqui. O projeto usa o que estava disponível; o `npm install` no seu Mac baixa o resto normalmente.
- ⛔ **Blender:** a VM ligada ao Mac é Linux e não executa o Blender.app. O build precisa rodar no Terminal do macOS (um comando).

Versão do Worker antes deste deploy (rollback com `wrangler rollback`): `06234ec1-e640-4084-b501-51c8b478e0f7`.

## Próxima ação exata

Conferir no iPhone o botão “Abrir no app do Gmail” (abre a caixa de entrada, não a mensagem). Ligar PacoteVício e Groq só se você quiser, pelos passos I e F de `docs/ACOES_DO_JOAO.md`. As flags em produção continuam `"false"`.

## Como retomar em outra sessão

1. Leia `CLAUDE.md`, este arquivo e `docs/REVISAO_DO_PDF.md`.
2. Rode `npm run check` para confirmar a base.
3. Use `npm run dev` e abra http://localhost:8787 (entrada local de desenvolvimento; Node, não workerd).
4. Antes de publicar: `npm run test:workerd` (`ok:true`, `schema:"0005"`). Publicar só com `npm run deploy`.
5. Continue pela “Próxima ação exata” e atualize este arquivo ao terminar.
