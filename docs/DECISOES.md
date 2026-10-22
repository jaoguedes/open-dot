# Registro de decisões técnicas

Formato: contexto → decisão → consequência. Novas decisões entram no fim. Revisões do PDF estão em `REVISAO_DO_PDF.md`.

### D-001 · Um Worker do Cloudflare para interface, API e cron (13/10/2026)
- **Contexto:** as rotinas precisam rodar com o Mac desligado, a custo zero. O Vercel Hobby limita o cron e o Render dorme.
- **Decisão:** um único Worker gratuito serve os arquivos estáticos (`apps/web/dist`), a API (`/api/*`) e um Cron Trigger de 5 em 5 minutos.
- **Consequência:** só dois provedores de infraestrutura (Cloudflare e Turso). Limites que importam: 10 ms de CPU e 50 subrequisições por invocação.

### D-002 · Sem Cloudflare Queues no MVP (13/10/2026)
- **Decisão:** o banco é a autoridade. Cada execução tem chave única por slot, lease e compare-and-set de versão. O próprio cron processa as execuções vencidas.
- **Consequência:** menos um serviço e menos uma cota para acompanhar. A fila volta se houver carga que justifique.

### D-003 · Turso via HTTP (Hrana) sem SDK (13/10/2026)
- **Decisão:** cliente próprio em `apps/worker/src/db/hrana.ts`, que usa o `/v2/pipeline` documentado e faz transação com batch condicional. No desenvolvimento local, o mesmo contrato roda sobre SQLite (`node:sqlite`).
- **Consequência:** zero dependências e testável offline com um servidor Hrana simulado. Ainda falta o teste contra o Turso real.

### D-004 · esbuild no lugar do Vite (13/10/2026)
- **Contexto:** sem acesso ao registro npm na sessão de criação. O esbuild estava disponível e é o motor que o Vite usa.
- **Decisão:** `scripts/build.mjs` gera o build e `scripts/dev.ts` sobe o servidor local (interface + API + agendador num processo).
- **Consequência:** dá para trocar pelo Vite depois sem mexer no código React.

### D-005 · Gmail primeiro, só metadados e trecho (13/10/2026)
- **Decisão:** a primeira integração completa é o Gmail com `gmail.readonly`, lendo `format=metadata` e o `snippet`. Corpo e anexos não são baixados. Outlook adiado.
- **Consequência:** menos dados privados guardados. A cobertura do resumo declara os campos lidos.

### D-006 · App OAuth publicado “Em produção” sem verificação (13/10/2026)
- **Contexto:** no modo *Testing*, o refresh token com escopos do Gmail expira em 7 dias (documentação oficial).
- **Decisão:** usar a exceção de uso pessoal: publicar o app, aceitar a tela de “app não verificado” e restringir a entrada a um único dono.
- **Consequência:** a reconexão só é pedida em caso de revogação, troca de senha, 6 meses sem uso ou o limite de 100 tokens por cliente.

### D-007 · IA só por provedor aprovado por tipo de dado (13/10/2026)
- **Decisão:** a allowlist começa só com o Groq Free (gpt-oss-20b/120b). E-mails privados só vão para lá depois que o ZDR for confirmado pelo João. O Gemini Free fica fora dos dados privados. Sem fallback pago.
- **Consequência:** sem chave ou sem ZDR, a triagem por regras continua funcionando.

### D-008 · Dot: tracinho de absorção permanente (13/10/2026)
- **Contexto:** os capítulos 36 e 39 do PDF tinham trocado a fenda por uma depressão temporária. O João pediu explicitamente para preservar o tracinho do catálogo.
- **Decisão:** a malha `Slot` é permanente e fica no alto da face frontal. A forma `Absorb_Receive` e o brilho do runtime marcam a absorção.
- **Consequência:** o validador recusa nós de boca ou sobrancelha. O tracinho não é boca.

### D-009 · Clipes do Dot em duas camadas (13/10/2026)
- **Decisão:** `body_*` anima o rig e `face_*` anima os morphs de uma única malha `Eyes`. Os estados combinam as duas camadas pelo `STATE_MAP` do manifesto.
- **Consequência:** evita conflito de nomes de Action e de slots no Blender 4.4+ e permite corpo e rosto simultâneos sem disputa no `AnimationMixer`.

### D-010 · Projeto em `~/open-dot`, separado de outros projetos do mantenedor (13/10/2026)
- **Decisão:** o Open Dot começa do zero, porque a base “v0.2” citada no PDF não existe no Mac. Um personagem de um projeto anterior, com mãos e indicador flutuante, é outro e não foi reaproveitado.
- **Consequência:** nenhum arquivo dos outros projetos foi alterado.

### D-011 · Posters do Dot com Cycles na CPU (13/10/2026)
- **Contexto:** em `--background`, o EEVEE (GPU/Metal) levou ~4 min por poster com 64 amostras e travou de vez num render de 64 px, provavelmente com a tela do Mac bloqueada.
- **Decisão:** os posters usam Cycles na CPU (32 amostras, denoise) e só três renders de 512 px; 160/64/32 px são reduções do poster de frente.
- **Consequência:** build completo em ~3 min, sem depender da GPU. O GLB não muda: só o render de conferência.

### D-012 · three.js sob demanda e um único canvas (13/10/2026)
- **Contexto:** o three.js minificado tem ~620 KB; a maior parte das telas não mostra o Dot grande.
- **Decisão:** o runtime 3D (`apps/web/src/dot3d/DotScene.ts`) é importado dinamicamente pelo `Dot3D.tsx` (esbuild com `splitting`). Só a página Mascote usa o 3D por enquanto; ícones da barra lateral, cabeçalho e ilha continuam no 2D. Um segundo `Dot3D` montado ao mesmo tempo cai para o 2D (“busy”).
- **Consequência:** o bundle inicial não cresce. Levar o 3D para a ilha é uma decisão de produto posterior (custo de GPU contínuo).

### D-013 · Repouso sem loop de render (13/10/2026)
- **Decisão:** em repouso o Dot não renderiza continuamente: só desenha quando algo muda (estado, olhar, carinho, toque, redimensionamento) e numa piscada a cada 3–6 s. “Pensando” e “trabalhando” rodam a até 30 fps.
- **Consequência:** a respiração `body_idle_breathe` só aparece durante transições. Se o João quiser respiração contínua, ela custa um loop de 30 fps (ou um modo de 10–15 fps a medir).

### D-014 · Dot principal é o motor em código (14/10/2026)
- **Contexto:** o João aprovou o protótipo `docs/referencias/dot_motor.html`. O brief chamava isto de D-011; D-011–D-013 já existiam (posters Cycles, three sob demanda, repouso).
- **Decisão:** o Dot que o app mostra é o motor SVG (`packages/core/src/dot` + `apps/web/src/dot`). Superelipse `|x/rx|^n + |y/ry|^n = 1`, n = 2,7 (4,5 na absorção), largura ≈ 1,3 × altura. Corpo com cara de 3D (degradê #FFFFFF → #BCC6F8, bordas lilás, luz no alto à esquerda, reflexo do agente embaixo, sombra de contato). Rosto, símbolos e partículas são arte 2D em degradê, sem pontos de brilho. Mãos só no “oi” (a direita acena; somem no fim); nenhum balão de fala. Tracinho só durante a absorção (o corpo vira quadrado e o tracinho abre brilhando) — isto substitui o D-008 no caminho do motor. Sem boca e sem sobrancelhas. Símbolos em selo redondo no alto à esquerda, só enquanto o estado dura. Acessórios calculados pela geometria do corpo. O runtime three.js/GLB (`apps/web/src/dot3d`, `Dot3D.tsx`, `blender/`) permanece no repositório atrás de `DOT_RENDERER = "engine" | "glb"` (padrão `"engine"`), para o chunk do three não carregar.
- **Consequência:** física a 120 Hz, desenho por atualização de atributos SVG (sem re-render do React por quadro). O GLB continua testável com `DOT_RENDERER=glb`.

### D-015 · Tema escuro, tipografia local e telas 01–05 (14/10/2026)
- **Contexto:** as 5 telas em `docs/referencias/design/` foram aprovadas. O brief chamava isto de D-012.
- **Decisão:** tema escuro como padrão: fundo #050608, superfícies #0E1014, borda #1A1D24, texto #F3F4F7 / #9AA0AE / #6B7181. Ação #3361FF, âmbar #FFB627, erro #FF4D6A, pronto #2BD47F. Agentes: Correio #5B8CFF, Código #8C6BFF, Sentinela #45E2BE, Foco #A98BFF. Inter na interface (títulos 600, tracking negativo), Instrument Serif itálico só na segunda linha da saudação, JetBrains Mono em rótulos/horários/fontes — as três locais (OFL), sem CDN. Navegação em pílula com item ativo azul; botão principal branco em pílula; cartões 20–22 px; brilho radial só nos 3 cartões de resumo; ilha preta do Dot no topo. Tema claro continua, derivado dos mesmos tokens.
- **Consequência:** o layout v0.2 do PDF (barra 224 / leitura 720 / contexto 262) é substituído por este shell nas telas web e PWA. Tokens num único arquivo de tema.

### D-016 · Camada de IA conforme a pesquisa de 14/10/2026
- **Contexto:** `docs/referencias/Open_Dot_APIs_IA_Nuvem.pdf`. O brief chamava isto de D-013. Amplia o D-007 sem relaxar o custo R$ 0.
- **Decisão:** Groq é o provedor ativo (`gpt-oss-20b` classifica; `gpt-oss-120b` resume e responde). Cloudflare Workers AI fica como fallback opcional (`env.AI`), desligado até passar na avaliação. Gemini, OpenRouter, Mistral, SambaNova e Z.ai ficam registrados e desligados; Gemini nunca recebe dado privado. GitHub Models (encerrado), Cerebras e Together não são tratados como gratuitos. Nenhuma rota paga, nenhum cartão, nenhuma recarga automática. Limites RPM/RPD/TPM/TPD saem do código e vêm da configuração da conta (vale o mais restritivo). 402 desliga a rota; 401/403 pausa a credencial; fallback só para política de dados igual ou mais restrita.
- **Consequência:** sem rota elegível o feed mostra fontes, assuntos e a classificação por regras, com “Resumo por IA pendente”. Nunca um sucesso falso. Chamadas Groq usam `max_completion_tokens` e `reasoning_effort: low`. 402 desliga a rota. O botão “Testar com exemplo fictício” só fala com o provedor falso.

### D-017 · Agentes Notícias, Mercado e Marketing (14/10/2026)
- **Contexto:** o brief pedia D-014 para estes agentes, mas D-014 já é o motor SVG. Custo R$ 0, só leitura.
- **Decisão:** três perfis aditivos (`noticias` #FF7A1F antena, `mercado` #16B26A viseira, `marketing` #F0457F boina). Notícias: só RSS/Atom da allowlist (2 veículos por tema; termos conferidos em 14/10/2026); dedupe por link e título; política com ≥ 2 veículos ou aviso; “O mundo hoje” às 08h, no máximo 3 itens por tema, sempre o link original; IA só com dado público. Mercado: CoinGecko (sem chave), Frankfurter/ECB (câmbio, sem chave) e Finnhub Free opcional (ações, chave pelo `setup:cloud`); alerta no limite do João; cartão “Só informativo, não é recomendação”; nenhuma rota de ordem. Marketing: Vercel leitura + Search Console `webmasters.readonly`; redes sociais planejadas; ideias de post são rascunho (`MARKETING_CAN_PUBLISH = false`).
- **Consequência:** schema `0003` (`od_news_items`, `od_quotes`, `od_agent_settings`). Conexões mostram estado, fontes, Testar e Desativar, sem dados falsos. Demonstração só em `demo.ts`, rotulada.

### D-018 · Entregas e provedor de rastreio (15/10/2026)
- **Contexto:** encomendas em modo somente leitura, custo R$ 0, sem dado pessoal fora do código de rastreio.
- **Decisão:** o agente Entregas usa a cor #C9862A e a ferramenta `tracking.read`. A detecção do código é determinística (formatos MIT de trycom/tracking_number_data, atribuição em NOTICE). Jadlog, Loggi e outros formatos brasileiros sem especificação publicada não são adivinhados: a pessoa escolhe a transportadora. O único adaptador HTTP é o PacoteVício (plano Básico, 1.000 consultas/mês), e só liga com `PACOTEVICIO_API_KEY` e `PACOTEVICIO_TERMS_CONFIRMED=true`. O app para em 900, consulta no máximo a cada 6 horas, não consulta entregue e mantém a atribuição. Ship24, Seu Rastreio e 17TRACK ficam de fora porque a API é paga. A API oficial dos Correios exige contrato do remetente. `proxyapp.correios.com.br` está bloqueado. rastrojs esconde o servidor de destino. Nenhum deles é chamado.
- **Consequência:** schema `0004` (`od_shipments`, `od_tracking_budget`, `od_owners.name_custom`). Sem chave ou sem a flag, a tela diz que o rastreio automático está desligado. Fora da cobertura, só o botão da página pública.

### D-019 · Cache, erros, orçamento e resumo (15/10/2026)
- **Contexto:** depois de um deploy, o Safari ficava com a tela preta. O cache do service worker não mudava de nome e o fallback de página única devolvia `index.html` no lugar de um chunk. A revisão de notícias também estourava as 50 subrequisições do Workers Free porque cada gravação no Turso é uma chamada HTTP.
- **Decisão:** o cache se chama `open-dot-shell-<hash do build>`. Navegação é network-first; assets são stale-while-revalidate. `/assets` e `/chunks` inexistentes respondem 404, nunca HTML. `npm run deploy` compila antes de publicar. O app consulta `GET /api/version` e avisa “Nova versão disponível”. Erros de tela, de chunk, da API e de execução usam o dicionário fixo em português, sem IA e sem stack, e-mail ou token. O orçamento de uma execução conta banco e HTTP e para antes de 45. Notícias gravam em lote, no máximo 15 por feed. O resumo do Correio é JSON com categoria, o que aconteceu e o que fazer. Para a Groq, só remetente, assunto e trecho curto, sem link nem código, e só com `GROQ_ZDR_CONFIRMED=true` (continua `"false"`). O link do PacoteVício fica sob a encomenda consultada. “Abrir no app do Gmail” abre a caixa de entrada (`googlegmail://`), não a mensagem; no iPhone isso ainda não foi testado num aparelho.
- **Consequência:** schema `0005` (`rfc822_id`). Execução que lança exceção termina `failed`. Fila futura não é cancelada. Slot `queued` ou `running` parado há mais de 10 minutos vira `failed` ou `uncertain`.

### D-020 · Schema compatível, item do feed e Folha (15/10/2026)
- **Contexto:** aplicar a migração `0005` com o Worker antigo ainda no ar fez o health ficar `ok:false` e parou o cron, porque o código exigia `version === REQUIRED_SCHEMA`. O feed da Folha (`rss091.xml`) devolve o artigo atrás de `redir.folha.com.br/.../*https://…`. A Finnhub gratuita não cobre PETR4.
- **Decisão:** o health e o tique aceitam schema igual ou mais novo (`version >= REQUIRED_SCHEMA`, textos com zeros à esquerda). A ordem é expandir a tabela, publicar o código, e só muito depois apertar o contrato. `0006` acrescenta `state`, `resolved_at` e `snooze_until` em `od_feed_items`. Um `stale_run` com mais de 30 minutos deixa de pintar o agente de erro. O link da Folha usa o endereço depois de `*http`. PETR4 não é consultada e não conta como falha (`b3_fora_do_plano`); brapi não entra enquanto os termos não forem confirmados. Cotações seguem no máximo a cada 15 minutos.
- **Consequência:** rollback para um Worker antigo depois de uma migração nova não derruba o cron, desde que o schema remoto seja mais novo que o código. O id de rollback desta publicação é `[ID de versão REDIGIDO]`. O Worker no ar é `[ID de versão REDIGIDO]`, app `75ea1683146c`.



### D-021 · Rodada 3: segurança, snapshot, acessibilidade e Correio (15/10/2026)
- **Contexto:** a rodada 3 (docs/PROMPT_RODADA_3.md) pediu correções, privacidade, desempenho, acessibilidade, sons e qualidade do resumo, a custo zero.
- **Decisão:** cookie `__Host-` e sessões listáveis; health público só `{ok}`; uma rota `/api/snapshot` com ETag no lugar de dez; leitura do banco com uma nova tentativa (escrita nunca); primeira tela ≤ 400 KB (meta 350) com telas pouco usadas sob demanda; diálogos com fundo `inert`; registro único de agentes; fila de aprovações; sons desligados por padrão; schema `0007` (estado do sistema e retorno da triagem). O retorno “Era importante/Não importa” guarda só o hash do domínio (e o domínio cifrado para a lista de silenciados). As marcas por item ficam no navegador (`localStorage`); o silêncio do remetente fica no servidor.
- **Consequência:** `npm run check` inclui `eval:correio`, que é regressão e **não** medida real (o conjunto foi ajustado junto com as regras). Contato público passa a ser editável em Conexões, com o ambiente como reserva.

### D-022 · Valores próprios do motor do Dot (15/10/2026)
- **Contexto:** três números do motor (expoente da superelipse em repouso e na absorção e a taxa de suavização das cores) estavam iguais a valores de fora do projeto.
- **Decisão:** o Dot usa valores próprios: superelipse n = **2,6** em repouso e **4,2** na absorção (`packages/core/src/dot/geometry.ts`); mistura de cores `1 − 0,003^dt` (`engine.ts`). Largura ≈ 1,3 × altura, molas e o resto não mudam. Substitui os números citados no D-014.
- **Consequência:** o corpo fica um pouco mais arredondado em repouso e a absorção um pouco menos quadrada; a troca de cor fica ~6% mais lenta. Capturas antes/depois em `docs/capturas/rodada3-dot/`.

### D-023 · Amarelo do ícone, vidro e ícones novos (rodada 4, 15/10/2026)
- **Contexto:** o João trocou o ícone (Dot em close sobre amarelo #FFBC03) e decidiu que o acento do app passa a ser esse amarelo, com fundo escuro mantido e vidro só na caixa de perguntas e no dock.
- **Decisão:** tokens em `apps/web/src/theme.css`. Escuro: `--accent #FFBC03`, `--on-accent #1A1400`, `--accent-soft rgba(255,188,3,.14)`, `--link #FFD24A`, `--warn #FF7A2F`. Claro: mesmo acento, `--accent-soft .24`, `--link #7A5300`, `--warn #A84300`. Texto sobre amarelo é sempre `--on-accent`; no claro o amarelo nunca é texto (usa `--link`), e o preenchido amarelo ganha contorno de 1px em `--link` (o amarelo tem 1,55:1 sobre o fundo claro). “Precisa de você” e alertas usam `--warn`. `--focus` = acento no escuro, `--link` no claro. Vidro: `color-mix(surface, transparente)` com `--glass-alpha: .88`, `blur(16px) saturate(1.5)`, fallback sólido a 94% sem `backdrop-filter` ou com transparência reduzida. **88% e não 52%**: com 52% o texto cai para 3,45:1 quando o corpo branco do Dot passa por baixo (regra: aumentar a opacidade, não o blur). Ícones: conjunto do João sem alteração (mestre em `assets/icones/dot-icone-1024.png`), `favicon.ico` montado dos PNG 16/32/256, `?v=4` nos links para o navegador e o iOS buscarem o ícone novo.
- **Consequência:** o `maskable-512` é igual ao `icon-512` e a bochecha direita do Dot passa da zona segura de 80% do Android (decisão de arte do João; os testes que exigiam o contrário foram trocados). Arte do Dot (corpo, brilho azul de repouso `#3F7BFF`, cor do Correio `#5B8CFF`, ícone de arquivo na absorção) não mudou. Supersede as cores de ação do D-015.

### D-024 · Paleta de mecanismos e Dot original imutável (19/10/2026)
- **Origem:** pedido direto do João e quatro arquivos lidos do ZIP Open_Dot_Conclusao_Agentes_Runner_Paleta_Aprovada.zip. Substitui decisões anteriores de paleta/tingimento do mascote.
- **Decisão:** Codex #8878EE, Claude Code #E99A69, Cursor #69A9DE exclusivamente em cartões, rótulos e indicadores de mecanismos. Função e driver são conceitos distintos: Correio/Código/etc. não recebem driver por inferência. Dot/orquestrador sem cor de identidade adicional. Verde reservado ao futuro WhatsApp; cores semânticas de sistema continuam permitidas.
- **Implementação:** mesmo artDefs/asset/GLB/geometria/olhos/expressões, sem novas skins ou peças. Tokens em theme.css; SVG fixa iluminação original de repouso, desliga overlays de tint e filtro cinza; fallback 2D e shader GLB desligam tingimento adicional. Expressões e prioridade semântica preservadas; falhas seguem com texto e indicadores da interface. O Dot anfitrião não recebe o acessório do agente selecionado.
- **Escopo desta atualização:** paleta/identidade na implementação existente. O prompt extenso do ZIP descreve trabalho futuro end-to-end; não transforma este ajuste visual em autorização para publicar releases, acessar credenciais ou declarar drivers implementados. Restrições diretas da conversa seguem vigentes. Não houve push, deploy, tag ou release.

### D-025 · Checkpoints e continuidade verificável (20/10/2026)
- **Origem:** pedido direto do João para continuidade entre agentes e versionamento profissional, sem publicação do repositório ou releases.
- **Decisão operacional:** inspecionar Git antes de retomar, preservar trabalho existente, commits pequenos com Conventional Commits após etapa lógica ou aproximadamente 30 minutos de trabalho significativo. Revisar diff, arquivos novos, segredos e dados pessoais antes de cada commit. Checkpoint incompleto somente em branch de desenvolvimento com estado explícito. Sem comandos destrutivos, reescrita do histórico compartilhado ou force push.
- **Continuidade:** `docs/CONTINUIDADE.md` registra objetivo, decisões, testes, limitações, branch, SHA de referência e próximo passo. AGENTS.md, CLAUDE.md e regras Cursor apontam para esse contrato. O commit amplo `504c00d` precede esta decisão e é preservado; não é um modelo para os próximos commits.
- **Produto proposto:** `docs/AGENT_CONTINUITY_PROTOCOL.md` separa checkpoint, commit local, sincronização autorizada e transferência por lease/CAS entre drivers. Enforcement no Runner ainda não implementado; política escrita não substitui controles em código. Handoff não transfere credenciais nem autorizações automaticamente.

### D-026 · Open Dot 2.0 por fatias verificáveis (20/10/2026)
- **Origem:** Blueprint/prompt mestre e instruções diretas atuais, lidos integralmente.
- **Decisão:** preservar stack, código, histórico, Dot e paleta; manter execução sequencial e corrigir recuperação antes de ampliar autonomia. Nome ODCP para continuidade. ADR-0001 mantém monólito modular/Runner e DB nativo; ADR-0002 introduz snapshot de memória cifrado CAS e Passport parcial.
- **Implementação limitada:** reconciliação/recibos e testes nativos reais; ledger interno com migração 0009 apenas em testes; contratos Expert/ODCP validados. Nenhum contrato concede ferramenta ou afirma disponibilidade de modelo. Timer/commits automáticos, leases, API/UI de memória e Passport completo ficam para próxima fatia.
- **Restrições:** push exige autorização específica; sem visibilidade pública, release, deploy, migração remota, serviços pagos ou alteração de licença. Revisão independente preparada, não presumida. Handoff em AGENT_HANDOFF e relatório em docs/audit.

### D-027 · Dot com a cor interna do agente e tokens do redesign v0.3 (21/10/2026, autorizada pelo João)
- **Origem:** prompt do v0.3 (Parte 1, seções 5.1 e 5.3), com o redesign, o trilho recolhido e a intensidade 100 já aprovados pelo João.
- **Decisão:** o motor do Dot ganha um parâmetro opcional `tint { color, intensity 0..100 }`. Na intensidade `k`, as paradas do degradê do corpo viram `mix(#FFFFFF,c,.10k)`, `mix(#FBF8FF,c,.30k)`, `mix(#EDE8FC,c,.66k)`, `mix(#D8D8FA,c,.90k)`, `mix(#BCC6F8,c,k)`; o contorno interno vira `mix(#8D8BDA,c,.85k)`; o brilho (`--g`) vira `c`. Padrão do produto: 100. Sem `tint`, o desenho é byte a byte o do v0.2 (teste golden com hashes gravados antes da mudança).
- **Não muda:** geometria, olhos `#120F1E`, bochechas `#FF8FB8`, animações, estados, acessórios pela geometria, regra do erro com texto.
- **Cores de agente no v0.3:** Codex `#A48BFF`, Claude Code `#FF9A55`, Cursor `#62AAFF`, Sentinela `#4FE3B6`, Foco `#F28FD0`. Substituem, no visual do v0.3, as cores de mecanismo do D-024 (`#8878EE`, `#E99A69`, `#69A9DE`), que ficam como histórico. Verde continua reservado ao futuro WhatsApp e às cores semânticas (`#34D17B`).
- **Consequência:** a regra 6 do `CLAUDE.md` e `.cursor/rules/*.mdc` passam a permitir esta única mudança no corpo; tokens em `docs/DESIGN.md`.

### D-028 · Reações do Dot a estado real (21/10/2026, autorizada pelo João)
- **Origem:** Parte 2 do prompt do v0.3, regra B4 (emenda às regras do Dot, decisão do João).
- **Decisão:** parâmetros opcionais `gaze`, `heat` e `strain` no motor (`setMood`), com padrão ausente = motor idêntico. Olhar: os olhos se deslocam no máximo 5,2 × 3 unidades do desenho na direção do ponteiro/foco, suavizados, e voltam ao centro quando o ponteiro sai ou a janela perde o foco; só com a janela visível e focada, no máximo ~30 quadros/s. Rubor: bochechas existentes maiores e mais intensas, mesmo rosa. Suor: uma gota na têmpora a partir de 0,6 (duas no pânico). Pânico (≥ 0,7): olhos ~22% maiores com brilho, piscar mais rápido, tremor curto só na entrada, duas gotas. Alegria leve: usa o estado de repouso existente, sem elemento novo.
- **Honestidade:** cada reação só dispara a partir de medida real (limiares com histerese da saúde do computador) ou de ponteiro real; o motivo aparece em texto (`title` e rótulo acessível).
- **Continua proibido:** boca, sobrancelhas, balão de fala, mãos fora do “oi”, tracinho fora da absorção, erro sem texto, mudar o corpo/geometria. `prefers-reduced-motion` desliga olhar e tremor e mantém gota e rubor estáticos. O GLB/three.js continua atrás da chave `glb`.
