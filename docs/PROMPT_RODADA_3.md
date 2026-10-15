# RODADA 3 — correções reais, auditoria em 3 passadas, navegação, sons e ideias do Coucou

Leia este arquivo INTEIRO antes de começar. Cumpra as fases NA ORDEM. Leia também AGENTS.md, CLAUDE.md, docs/DECISOES.md, docs/STATUS.md e docs/ACOES_DO_JOAO.md.

## Regras fixas (valem para tudo)
- NÃO mude `GROQ_ZDR_CONFIRMED` nem `PACOTEVICIO_TERMS_CONFIRMED` (continuam "false"). Nunca imprima segredos. Não toque em `.dev.vars`.
- Commits pequenos, um por item, autor noreply de sempre, mensagem em português dizendo o efeito para o usuário.
- Sem gamificação (sem sequências de dias, recompensas, coroa).
- Interface 100% em português do Brasil, frases curtas e humanas. Nada de código técnico cru na tela (use o dicionário `packages/core/src/errors-pt.ts`).
- Migrações: SOMENTE novas (0006, 0007…), aditivas (ADD COLUMN / CREATE TABLE IF NOT EXISTS). Nunca edite migração já aplicada, nunca apague coluna.
- Nada de "feito" sem prova. Cada item termina com: teste automático que falha antes e passa depois, e (para interface) verificação em 390x844 com `npm run ui:mobile`.
- Não copie nome, personagem, sons ou imagens do projeto Coucou. Só ideias de arquitetura. Registre a inspiração (código MIT) em docs/LICENCAS.md e NOTICE.
- Mantenha um diário em `docs/RODADA3_LOG.md`: item, o que reproduziu de verdade, o que mudou, teste.
- Se um item for impossível ou arriscado, NÃO invente: pare esse item, registre no diário com o motivo e siga para o próximo.

## Pré-checagem (antes de tudo)
1. `git status` e `git log -3`. Os arquivos novos `apps/web/public/sounds/*.mp3`, `apps/web/public/sounds/README.md` e `scripts/sounds/make_dot_sounds.py` já existem (feitos pelo Claude); NÃO os regere nem apague. Commite-os junto da Fase E.
2. Rode `npm run check`. Anote a linha de base de testes no diário.
3. Os arquivos soltos `blender/gui_run_build.py`, `docs/PROMPT_CURSOR_DOT_VISUAL_IA.md`, `docs/referencias/`: pergunte-se se contêm segredo; se não, commite; se sim, ignore no .gitignore e avise.

====================================================================
## FASE A — bugs reais (publique no fim da fase: `npm run deploy`)
====================================================================

### A1. Navegação nos agentes (prioridade máxima)
Problema: dentro de /agente/:id só se volta por "Meu dia". No celular o dock só tem 5 ícones.
- Botão "← Voltar" no topo de toda tela de agente, aprovação e telas internas: `history.back()` quando há histórico do app; senão `/meu-dia`. Alvo de toque ≥ 44px, `aria-label="Voltar"`.
- Faixa de agentes (chips roláveis com a carinha e o estado de cada agente) no topo de /agente/:id para trocar de agente sem passar por Meu dia. Marque o atual com `aria-current`. A rolagem leva o chip atual para o centro.
- Tocar na aba ativa do dock volta ao topo/raiz da seção.
- Gesto de voltar do iOS e botão voltar do navegador funcionam (popstate já existe: teste).
- `App.tsx` linha ~161: `decodeURIComponent` pode lançar em URL mal formada → trate com try/catch e mostre "Endereço inválido" com botão para Meu dia.
- Rota desconhecida hoje cai em `<Home agentId="dot"/>`: crie tela "Não achei essa página" com botão Meu dia.
- `ui:mobile`: entrar em 3 agentes, voltar, trocar pela faixa, rota inválida; nunca tela preta.

### A2. Erros que nunca saem da tela
Causas (confira no código):
- `/api/status` (`apps/worker/src/app.ts` ~l.536-557) olha só a última execução; `stale_run` e `failed` ficam "error" para sempre se não houver execução nova.
- `semanticFromItems`/`agentPresence` (`apps/web/src/presence.ts`) mantêm o agente em "error" enquanto existir um item `ci_failure` ou `site_incident` no feed, mesmo depois de resolvido.
- Corrija:
  1. Execução encerrada por `stale_run` há mais de 30 min deixa de contar como erro (vira linha discreta no histórico).
  2. Novo estado de item do feed: migração 0006 adiciona `state TEXT NOT NULL DEFAULT 'open'` e `resolved_at TEXT NULL` em `od_feed_items` (ADD COLUMN). Estados: open, done, snoozed (+ `snooze_until`).
  3. Rotas `POST /api/feed/:id/done` e `POST /api/feed/:id/snooze` (adiar até amanhã 08h no fuso do dono). Com CSRF e auditoria.
  4. Botões "Feito" e "Adiar" em todo cartão "Precisa de você". Contagens (Meu dia, barra lateral, pílulas) ignoram done/snoozed.
  5. `site_incident` fecha sozinho quando o monitor volta (o evento "voltou a responder" já existe: marque o incidente como done). `ci_failure` fecha quando chega workflow success do mesmo repo.
  6. Erro real recente mantém o Dot de erro, com botão "Dispensar" (some até a próxima execução do mesmo agente).
- Bug de contagem em `MyDay.tsx` l.28: `need = mailNeed || outros` subestima quando há e-mails e incidentes juntos; some os dois.
- Testes: stale_run 31 min não é erro / 5 min é; incidente resolvido some da contagem; snooze reaparece depois do prazo.

### A3. Dados de demonstração aparecendo no site real (grave)
`apps/web/src/store.tsx` `refresh()`: se a API falha na primeira carga (500, 503, rede), cai em `enterDemo("A API do Open Dot não está rodando aqui.")` e mostra dados FALSOS no site de produção.
- Em produção (hostname diferente de localhost) NUNCA entre em demonstração automaticamente. Mostre tela de erro do Dot: "Não consegui falar com o servidor", motivo humano, botões Tentar de novo / Ver demonstração (só por clique).
- Demonstração continua só por `?demo=1`, botão no login e localhost sem API.
- Se já houver dados carregados e a atualização falhar: mantenha os dados, marque "desatualizado" com a hora (já existe `failures`).
- Teste: API devolve 500 na primeira carga → tela de erro, sem dados fictícios.

### A4. Notícias: `invalid_feed` (causa já reproduzida com a mesma lógica do parser: título em CDATA vira `null` e o `&amp;lt;` vira `<`; confirme no seu teste)
Em `packages/core/src/news.ts`:
- `tag()` remove tags HTML ANTES de desembrulhar CDATA. Títulos como `<title><![CDATA[Texto]]></title>` (BBC, NPR e a maioria dos feeds) viram string vazia, o item é descartado e o feed inteiro dá "nenhum item com título e link https". Ordem correta: (1) se houver CDATA, usar o conteúdo interno cru; senão remover tags; (2) decodificar entidades.
- `decodeXml` troca `&amp;` ANTES de `&lt;`: `&amp;lt;` vira `<` (decodificação dupla). Decodifique `&amp;` por último. Suporte a `&apos;`, `&nbsp;`, numéricas `&#8217;` e `&#x2019;`.
- Links `http://` são descartados; aceite http e normalize para https (descarte se o host não for da allowlist).
- Atom: prefira `<link rel="alternate" href>`; hoje pega o primeiro `link`.
- RSS 0.91 (Folha `rss091.xml`), RSS 1.0/RDF (`<item rdf:about>`, `dc:date`), `guid` como fallback de link, namespaces, BOM e encoding.
- Ordene por data (mais novo primeiro) ANTES de cortar `PER_FEED`; hoje `worldToday` pega os 3 primeiros do feed sem ordenar.
- Em `apps/worker/src/services/news.ts`: rotação `minute % allowed.length` com cron de 5 em 5 minutos só alcança alguns índices quando o total é múltiplo de 5 (ex.: 5 ou 10 feeds → alguns nunca são lidos). Hoje são 8 feeds e funciona por sorte; é bug latente. Use `Math.floor(now/300000) % N`.
- `fetch` dos feeds: `User-Agent: OpenDot/1.0 (uso pessoal)`, timeout de 10 s (`AbortSignal.timeout`), limite de 1 MB no corpo (hoje `res.text()` sem limite), verifique `content-type`.
- Reproduza ANTES de mudar: baixe cada feed da allowlist (Node), registre status, content-type, 300 primeiros bytes e o motivo do parser; coloque fixtures reais anonimizadas (CDATA, Atom, RSS 0.91, RDF, com entidades) em `packages/core/test`. Se um feed morreu, troque a URL e registre em docs/DECISOES.md.
- A UI "Detalhes técnicos" mostra o motivo real por fonte (HTTP 4xx, XML inválido, sem itens).

### A5. Mercado: `upstream_http_403`
- CoinGecko (`apps/worker/src/services/quotes.ts` l.23): envie `User-Agent` e `Accept: application/json`. Reproduza antes. Se continuar 403/429, aceite chave Demo opcional `COINGECKO_DEMO_API_KEY` (cabeçalho `x-cg-demo-api-key`), nunca impressa, e documente em docs/ACOES_DO_JOAO.md.
- PETR4.SA: o plano grátis da Finnhub não cobre a B3 (403). Pesquise uma fonte gratuita e permitida para B3 (ex.: brapi.dev tem plano gratuito com token; CONFIRME os termos antes). Se nenhuma servir, mostre "Ações da B3 não estão no plano gratuito desta fonte" e NÃO conte como falha.
- `jobs.ts` busca cotações a cada tique (5 min) para sempre: passe para a cada 15 min e só em horário útil para ações; cripto/câmbio 15 min. Guarde `last_fetch` e pule se recente. Uma fonte falhando nunca derruba as outras.

### A6. O tique do cron não pode cair por inteiro
`apps/worker/src/jobs.ts`: só `BudgetExhausted` é capturado; qualquer outra exceção em sync do Gmail, monitores, Vercel, entregas ou notícias aborta o tique inteiro e pula os passos seguintes.
- Envolva CADA passo (1 a 6) em try/catch próprio: registre `repo.audit`/log com `safeReason`, siga para o próximo passo. `BudgetExhausted` encerra o tique (já faz).
- `report` ganha `stepErrors: Array<{step, reason}>`.
- Teste: forçar falha no passo 2 e verificar que 3, 4 e 5 ainda rodam.

### A7. Rollback não pode quebrar o app
`REQUIRED_SCHEMA` exige igualdade (`version === REQUIRED_SCHEMA`) em `/api/health` e no tique. Se você fizer `wrangler rollback` para um Worker antigo depois de uma migração nova, o health vira `ok:false` e o cron PARA. Já aconteceu uma janela assim no deploy anterior.
- Troque para compatibilidade: `ok` quando `version >= REQUIRED_SCHEMA` (strings com zero à esquerda comparam bem). Documente a política "expandir → publicar → (muito depois) contrair" em docs/DECISOES.md.
- `scripts/deploy.mjs`: lê o `origin` e o schema esperado de configuração/`REQUIRED_SCHEMA`, não de texto fixo ("0005"); aplique migrações ANTES de publicar.
- Teste: schema 0006 com REQUIRED 0005 é ok; schema 0004 com REQUIRED 0005 não é.

### A8. API e login mais robustos
- `apps/worker/src/index.ts`: `fetch` não tem try/catch geral. Erros em `buildCtx` (ex.: `TOKEN_KEYS` inválido lança), `decodeURIComponent` de rota (app.ts l.48, fora do try) e `loadKeyring` viram página 1101 da Cloudflare. Envolva tudo: resposta JSON 503/400/500 padronizada com `problem()`.
- `req.json()` com corpo inválido lança SyntaxError e vira 500; deve ser 400 `invalid_input`. Centralize um `readJson()`.
- `GET /api/feed?before=` faz `JSON.parse(atob(cursor))` sem validar → 500 com cursor lixo; valide com zod e responda 400.
- `/api/oauth/google/callback`: `exchangeCode`/`readIdToken`/`getProfile` podem lançar e o navegador mostra JSON cru. Capture e redirecione para `/?erro=…` (login) ou `/conexoes?erro=…`.
- Login (`App.tsx` `Login`) só conhece 4 códigos. Adicione textos para `callback_invalido`, `sem_id_token`, `sessao_trocada`, `sem_refresh_token`, `permissao_gmail_negada`, `permissao_gsc_negada`; Conexões mostra o banner de `?erro=`/`?ok=` e limpa a URL.
- Webhook GitHub: `JSON.parse` após a assinatura pode lançar → 400.

### A9. Textos e mensagens (restos da rodada anterior; confirme se já foram corrigidos)
- "[object Object]" no resultado do teste de feed; separador "Fonte: motivo" (nunca "CoinGeckoupstream_http_403"); remover "Ship24/Seu Rastreio: API paga" da interface (`packages/core/src/tracking.ts` l.27-28); botão "Copiar código" ao lado de "Abrir no site da transportadora".
- Regressão em `ui:mobile`: falha se aparecer "[object Object]", `stale_run` cru, "Ship24", ou código técnico colado em nome.

### A10. Dot de erro sem barulho
`api.ts` l.209 dispara `od-trouble` para QUALQUER 5xx/reason e o polling repete. Agrupe: no máximo um aviso por código a cada 5 minutos; erros durante polling em segundo plano só viram banner "desatualizado", não o Dot grande; erros causados por ação do usuário (clique) mostram o Dot.

>>> FIM DA FASE A: `npm run deploy`. Confira /api/health, /api/version e abra a tela em 390x844. Registre versão do Worker e rollback no diário.

====================================================================
## FASE B — segurança e privacidade
====================================================================
- B1. `/api/legal` entrega o e-mail do dono a qualquer visitante (usado na Privacidade). Troque por um endereço de contato configurável `CONTACT_EMAIL` (pode ser o mesmo, mas opcional) ou um formulário/mailto ofuscado. `/api/health` público devolve `configured` (quais segredos existem) e `env`: reduza o público a `{ok}`; o detalhe só autenticado.
- B2. `APP_ENV` tem default "development" (`env.ts`): o default deve ser "production" (seguro por padrão).
- B3. Cookie de sessão: use prefixo `__Host-` (Secure, Path=/, sem Domain) em produção; rotação do token no login; rota "Sair de todos os dispositivos" (apaga todas as sessões do dono) e lista de sessões (user agent + data) em Conexões.
- B4. `ForcedBoom` (`App.tsx` l.454) é gancho de teste dentro do código de produção; condicione a uma flag de build de teste para não ir ao bundle publicado.
- B5. Nome "João" e domínio fixos no código (`app.ts` login `name: "João"`, `NameLine` fallback, `scripts/deploy.mjs`, demo): troque por configuração (`OWNER_NAME`, `APP_ORIGIN`) para o projeto poder virar open source.
- B6. Cabeçalhos: adicione `media-src 'self'` explícito à CSP (sons) em `_headers` e `SECURITY_HEADERS`; `Permissions-Policy` continua sem microfone até o ditado existir.
- B7. Teste automático: nenhum log (`console.*`) nem resposta de erro contém token, e-mail, trecho de mensagem ou cabeçalho Authorization (varra saídas em teste com dados "isca").

====================================================================
## FASE C — desempenho e rede (no Workers Free e no Turso)
====================================================================
- C1. Hoje cada atualização dispara 10 requisições (`loadSnapshot` em api.ts l.325) — todo minuto e a cada foco. Crie `GET /api/snapshot` único (mesmos dados) com `ETag`/`If-None-Match` (304 quando nada mudou) e mantenha as rotas antigas. Intervalo 60 s só com a aba visível; no foco, no máximo 1 atualização a cada 15 s.
- C2. `HranaDb.pipeline` e `req()` do cliente não têm timeout nem nova tentativa. Adicione `AbortSignal.timeout(8000)` e UMA nova tentativa para leituras (GET e `query`) em 5xx/429/erro de rede com espera curta; escritas não repetem automaticamente. Respeite `Retry-After`.
- C3. Cache: `/assets/chunks/*` tem nome com hash → `Cache-Control: public, max-age=31536000, immutable`; `app.js`/`app.css` sem hash continuam curtos. `/sounds/*` 1 dia.
- C4. Splash: hoje espera no mínimo 1,2 s em TODA abertura (`useSplash`). Mostre só na primeira abertura da sessão (`sessionStorage`) ou quando o carregamento real passar de 400 ms.
- C5. Verifique o tamanho do bundle: meta `app.js` ≤ 350 KB (hoje ~353 KB), pdf.js só sob demanda (já é). Adicione um teste que falha se `app.js` passar de 400 KB.

>>> `npm run deploy` ao fim das fases B e C (um deploy por vez; confira o health).

====================================================================
## FASE D — interface e acessibilidade
====================================================================
- D1. Busca/lupa: o botão "Pergunte ao Dot ⌘K" abre uma paleta "Ir para…" que só navega; o campo de perguntar está em outro lugar. Unifique: ao digitar aparecem (1) destinos, (2) agentes, (3) linha "Perguntar ao Dot: <texto>" que chama `/api/ask` e mostra a resposta com fontes no próprio diálogo. Setas ↑↓ + Enter, Esc fecha, foco preso no diálogo e devolvido ao botão que abriu. No celular ocupa a tela com o teclado sem esconder o campo.
- D2. O sino "Notificações" não faz nada. Faça a "Central do Dot": lista dos últimos 20 eventos (execuções concluídas, falhas, incidentes, novos itens), com "marcar tudo como visto" e ponto no sino quando há novos. Sem push ainda.
- D3. Feed do Meu dia: `api.feed()` ignora `next` (sem paginação). Botão "Mostrar mais" usando o cursor. Datas: `fmtTime` só mostra hh:mm; para itens de outros dias use "ontem 17:00", "seg 09:30". Filtro "Fontes" hoje não é claro; renomeie para "Com link".
- D4. Acessibilidade: drawer do menu e diálogos com foco preso e fundo `inert`; Esc fecha; `role="tablist"` do filtro precisa de navegação por setas e `tabpanel`; o `role="status"` da ilha do Dot (`Island`) anuncia a cada mudança — mude para `aria-live="off"` e anuncie só mudanças importantes (erro, precisa de você); contraste ≥ 4.5:1 nos temas claro e escuro (rode axe; já há `@axe-core/playwright`); fonte mínima 12px (há 11px em `styles.css` l.51); alvos ≥ 44px.
- D5. Estilo: há ~113 `style={{…}}` inline nos .tsx. Converta nos arquivos que você tocar nesta rodada para classes em `styles.css`/`theme.css` com tokens (sem hex solto).
- D6. Ícones: `maskable-512.png` é idêntico a `icon-512.png` (sem margem de segurança → o Android corta o Dot). Gere maskable com o Dot dentro dos 80% centrais; `apple-touch-icon` 180×180.
- D7. Caixa de perguntas (`Composer`): no celular Enter hoje ENVIA; use Enter = nova linha e botão enviar no toque (em desktop Enter envia, Shift+Enter quebra linha); ignore Enter durante composição (`isComposing`); cresce até 5 linhas; a última resposta fica salva na sessão; botão "Limpar".
- D8. `Home.tsx` usa fuso fixo `America/Sao_Paulo` para a data; use o fuso do dono (`snap.owner.timeZone`).

====================================================================
## FASE E — do Coucou (só ideias, sem assets) + sons do Dot
====================================================================
- E1. REGISTRO ÚNICO DE AGENTES em `packages/core` (estenda `agents.ts`): id, nome, cor, rosto, rota, descrição, ferramentas, visibilidade na barra/lista/busca/pílulas. `App.tsx`, `MyDay.tsx`, `Home.tsx` e a paleta derivam dele (hoje `SIDEBAR_AGENTS`, `LIST_AGENTS`, o array de pílulas e a paleta divergem). Teste: agente falso aparece em todos os lugares e some de todos ao remover. Opcional simples: usuário escolhe quais agentes ficam ativos e a cor de cada um (por dono).
- E2. FILA DE APROVAÇÕES: um por vez, em ordem de chegada, "1 de N", máximo 5 visíveis, o resto em "mais N". Lógica pura em `packages/core` com testes (ordem, limite, duplicata, expiração).
- E3. APROVAÇÃO AMARRADA AO CONTEÚDO: JÁ existe — `repo.decideApproval` só aprova se `version` e `payload_hash` baterem, de forma atômica (bom, mantenha). Falta só: quando devolver "conflict", a tela dizer em português se foi porque o conteúdo mudou ("O conteúdo mudou. Aprove de novo.") ou porque já foi decidido; e testes cobrindo as duas causas.
- E4. `docs/DOT_COMPORTAMENTO.md`: tabela estado do Dot → animação → duração → prioridade → gatilho (repouso, pensando, trabalhando, esperando você, erro, desconectado, concluído), regra de desempate quando dois estados competem, `prefers-reduced-motion` e pausa com aba oculta. Descreva o que o código faz HOJE; liste divergências e corrija só as claras.
- E5. CARTÃO DE PROGRESSO na ilha (execução ativa: "Correio · etapa 2 de 4", barra simples, sem pontuação) e PÍLULAS DE FONTE no resumo do Correio/Notícias (carinha do agente + origem; toque abre o e-mail ou a notícia).
- E6. CHANGELOG.md (dos commits) e CONTRIBUTING.md (como rodar/testar, a regra "o app prepara, o usuário aprova", como adicionar agente pelo registro de E1).
- E7. SONS DO DOT. Os arquivos estão em `apps/web/public/sounds/` (13 MP3, originais): dot-hello, dot-think, dot-done, dot-attention, dot-error, dot-send, dot-receive, dot-tap, dot-love, dot-sleep, dot-pop, dot-close, dot-notify. Leia `apps/web/public/sounds/README.md`.
  - Crie `apps/web/src/sound.ts`: pré-carrega no PRIMEIRO toque do usuário (iOS exige gesto), `play(nome)`, volume padrão 0,25 (0 a 0,6), DESLIGADO por padrão (`Prefs.sound=false`, `Prefs.soundVolume`), não toca com `document.hidden`, no máximo 2 sons por segundo, `dot-error` e `dot-attention` têm prioridade e cortam os outros.
  - Gatilhos: hello (1× por sessão após entrar), think (execução inicia por clique), done (execução ok), attention (aprovação nova ou contagem "precisa de você" subiu), error (quando o Dot de erro aparece por ação do usuário), send/receive (caixa de perguntas), pop/close (busca, menu, painéis), tap/love (carinho no Dot), notify (item novo chegou no polling), sleep (opcional: 10 min parado).
  - Tela Mascote: chave "Sons do Dot", controle de volume e botões "Ouvir" para cada som.
  - Testes: com `Audio` falso, nada toca quando desligado/oculto/limite excedido; prioridade funciona.
  - Não adicione sons ao Service Worker (carregam sob demanda).
  - NÃO regere os MP3. Se achar um som ruim, avise no relatório; o João decide.

====================================================================
## FASE F — qualidade e engenharia
====================================================================
- F1. CI: `.github/workflows/ci.yml` com typecheck, `npm test`, build, varredura de segredos (gitleaks ou regex própria) e axe do `ui:mobile` quando possível. Sem segredos no CI.
- F2. ESLint (typescript-eslint, `react-hooks`, `jsx-a11y`) + Prettier + `.editorconfig`. Corrija erros reais; não reformate o projeto inteiro num commit só (um commit "formatação" separado).
- F3. Tipos duplicados à mão entre worker e web (`api.ts` "espelham as rotas"): mova os contratos para `packages/core/src/contracts.ts` com zod e valide a resposta no cliente em desenvolvimento.
- F4. Diagnóstico: tela "Conexões > Diagnóstico" (só autenticado) com health, versão, últimas execuções com falha (código humano), última rodada do cron e botão "Copiar relatório" SEM segredos. Reaproveite o dicionário de erros.
- F5. `docs/ARQUITETURA.md` (1 página: fluxo requisição → rota → repo → Turso; cron; limites do Workers Free: 50 subrequisições, 10 ms CPU).
- F6. Dados: "exportar meus dados" (`GET /api/export`, JSON) e "apagar tudo" (com confirmação dupla) — transparência/LGPD.

====================================================================
## FASE G — qualidade do resumo do Correio (ciência de dados)
====================================================================
Problemas vistos em `packages/core/src/correio.ts` e `apps/worker/src/services/email-review.ts`:
- `classify()` confere palavras-chave de segurança/pagamento/prazo ANTES de checar se o e-mail é em massa (`bulk`): uma promoção com "última chance, prazo termina hoje" vira "prazo" e "precisa de você". Mensagens em massa só podem entrar em segurança/pagamento quando o remetente for de confiança (domínio já visto em e-mail NÃO em massa) ou houver sinal forte (ex.: "pagamento recusado"); o resto vira ruído.
- Vários e-mails da mesma conversa (`threadId`) geram vários itens: agrupe por thread e mostre o mais recente com "(+N na conversa)".
- `redactMail` apaga QUALQUER sequência de 5 a 8 dígitos (estraga valores, CEP, número de pedido) e `resumoHasSecret` rejeita o JSON inteiro da IA se houver "@" ou 5 a 8 dígitos em qualquer lugar: a IA quase nunca passa e o resumo cai para regras. Refine: redija só o que parece código de login (6 dígitos isolados perto de palavras como "código", "verificação", "token", "senha") e cartão (13 a 19 dígitos); valores com "R$"/vírgula e números de pedido ficam. Na validação da IA, rejeite apenas padrões realmente sensíveis.
- Sem medição. Crie `packages/core/test/fixtures/correio-gold.json` com ≥ 60 e-mails SINTÉTICOS (nenhum real) rotulados (categoria esperada, importante sim/não), incluindo casos difíceis (promoção com palavra de prazo, aviso real de pagamento, código de login, rastreio, pergunta de pessoa). Script `npm run eval:correio` imprime precisão e revocação por categoria e FALHA se a precisão de "precisa de você" ficar abaixo de 0,85 ou a revocação de segurança/pagamento abaixo de 0,95.
- Feedback do dono: em cada item do resumo, botões "Era importante" e "Não importa". Migração 0007 cria `od_triage_feedback` (owner_id, sender_domain_hash, categoria, rótulo, at). "Não importa" repetido 2× do mesmo remetente passa a tratar o remetente como ruído ("Silenciei X"); desfazer em Conexões > Correio > Remetentes silenciados. Nunca guarde corpo nem endereço completo em claro (use hash do domínio).
- `abertura` e contagens usam só itens abertos (respeita Feito/Adiar da A2).

====================================================================
## AUDITORIA EM 3 PASSADAS (depois da Fase G, antes do deploy final)
====================================================================
Rode as três, uma de cada vez, cada uma lendo o `git diff` desde o início da rodada E o código inteiro dos arquivos tocados. Registre em `docs/AUDITORIA_1.md`, `_2.md`, `_3.md` uma tabela: arquivo:linha | problema | gravidade (P0/P1/P2) | correção | teste. Corrija P0 e P1 na hora. Rode `npm run check` a cada passada.

PASSADA 1 — Correção e erros: toda função `async` sem try/catch num caminho de usuário; `JSON.parse`/`atob`/`decodeURIComponent` sem proteção; `catch {}` vazio que engole erro importante (há ~19; justifique ou trate); `!` (non-null) em dados externos; condições de corrida (duplo clique, duas abas); estados de carregando/vazio/erro/offline em TODAS as telas; textos técnicos vazando.
PASSADA 2 — Segurança, privacidade, desempenho: autorização por `owner_id` em TODA query; CSRF em toda mutação; CSP sem inline; logs sem dados pessoais; limites de subrequisição e de CPU; consultas N+1; tamanho de bundles; polling; cabeçalhos de cache.
PASSADA 3 — Experiência e regressão: percorra no celular (390x844) e no desktop cada tela, cada botão, cada estado vazio/erro; navegação de ida e volta; teclado; leitor de tela (rótulos); temas claro/escuro; reduzir movimento; sons ligados e desligados; compare com `docs/STATUS.md`. Critério de parada: a Passada 3 não encontra nenhum P0 nem P1.

## Entrega final
1. `npm run deploy`. Confira /api/health, /api/version, a fumaça e abra o site em 390x844.
2. Relatório em tabela: item | feito/não | o que foi reproduzido de verdade (status, content-type, mensagens) | teste | versão do Worker e rollback.
3. Liste separadamente: o que depende do João (confirmar ZDR da Groq; ligar PacoteVício; chave do CoinGecko se pedir; testar no iPhone) e o que você NÃO conseguiu fazer e por quê.
4. Atualize docs/STATUS.md, docs/DECISOES.md, docs/ACOES_DO_JOAO.md, CHANGELOG.md.
