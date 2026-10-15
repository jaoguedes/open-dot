# STATUS — Open Dot

_Atualizado em 15/10/2026, rodada 2. Produção `ok:true`, schema `0005`, Worker `da21bebf-d11a-4fdc-abad-c87022130c56`, app `6b4e0f771bdb`. Rollback com `wrangler rollback`: `e065a2e9-70dc-479d-9fd7-f44bf2e6cc4d`. Rastreio automático desligado (`trackingState: desligado`)._

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

Versão do Worker antes deste deploy (rollback com `wrangler rollback`): `da21bebf-d11a-4fdc-abad-c87022130c56`.

## Próxima ação exata

Conferir no iPhone o botão “Abrir no app do Gmail” (abre a caixa de entrada, não a mensagem). Ligar PacoteVício e Groq só se você quiser, pelos passos I e F de `docs/ACOES_DO_JOAO.md`. As flags em produção continuam `"false"`.

## Como retomar em outra sessão

1. Leia `CLAUDE.md`, este arquivo e `docs/REVISAO_DO_PDF.md`.
2. Rode `npm run check` para confirmar a base.
3. Use `npm run dev` e abra http://localhost:8787 (entrada local de desenvolvimento; Node, não workerd).
4. Antes de publicar: `npm run test:workerd` (`ok:true`, `schema:"0005"`). Publicar só com `npm run deploy`.
5. Continue pela “Próxima ação exata” e atualize este arquivo ao terminar.
