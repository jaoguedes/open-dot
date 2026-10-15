Leia CLAUDE.md, docs/STATUS.md e docs/DECISOES.md. Esta tarefa tem três partes, nesta ordem: (A) trocar o motor do Dot por um motor em código; (B) aplicar o novo visual aprovado ao web app e transformá-lo em PWA; (C) atualizar a camada de IA conforme a pesquisa de 14/10/2026. A e B foram APROVADOS pelo João: porte com fidelidade, sem reinventar.

## 0. Fontes da verdade (abra no navegador do Cursor e leia o código)
- docs/referencias/dot_motor.html → o Dot aprovado: classe DotEngine, tabelas STATES/TL/STILL, bodyD, proj, bodyPt, EYE/EXPR, arte 2D (art2) e acessórios (acc3d). Mexa em tudo: estados, reações, acessórios, mouse e 3 cliques.
- docs/referencias/design/index.html → as 5 telas aprovadas: 01 web "Meu dia", 02 PWA início, 03 PWA aprovação, 04 PWA carregamento, 05 sistema visual.
- docs/referencias/dot_funcoes_acessorios.png e dot_absorcao.png → acessórios e absorção.
- docs/referencias/Open_Dot_APIs_IA_Nuvem.pdf → pesquisa de provedores de IA (Parte C).
- SUPERADOS, não use: docs/referencias/dot_previa.html e o visual atual do app.
- ~/Documents/mascot-desk é SOMENTE LEITURA. Não altere nada lá.

## 1. Decisões (registre como D-011, D-012 e D-013 em docs/DECISOES.md; atualize CLAUDE.md e .cursor/rules/10-visual.mdc e 20-backend.mdc)

D-011 Dot:
1. O Dot principal é o motor em código (SVG). O runtime three.js/GLB (apps/web/src/dot3d, Dot3D.tsx, blender/) fica atrás da chave DOT_RENDERER = "engine" | "glb", com padrão "engine". NÃO apague esses arquivos; só tire do caminho padrão, para o chunk do three.js não carregar.
2. Forma: superelipse |x/rx|^n + |y/ry|^n = 1, com n = 2,6 no normal e 4,2 na absorção. Largura ≈ 1,3 × altura.
3. Corpo com cara de 3D: degradê #FFFFFF → #BCC6F8, bordas escurecendo para lilás, luz principal no alto à esquerda, reflexo da cor do agente embaixo e sombra de contato. Rosto, símbolos e partículas são ARTE 2D desenhada: fofa, em degradê suave, SEM pontos de brilho.
4. Mãos SÓ no "oi": duas mãozinhas, a direita acena e as duas somem no fim. Nenhum balão de fala.
5. Tracinho SÓ durante a absorção: o corpo vira quadrado e o tracinho abre brilhando.
6. Sem boca e sem sobrancelhas. Símbolos em selo redondo (aro escuro, miolo em degradê, desenho branco) no alto à esquerda, só enquanto o estado dura.
7. Acessórios calculados pela geometria do corpo: assentam na superfície, giram com o olhar e no giro, amassam junto e deixam sombra de contato. Boné com gomos e aba; óculos com hastes que contornam a cabeça; fone abraçando o topo; anel da Sentinela envolvendo a base, com a metade de trás atrás do corpo.

D-012 Visual:
1. Tema escuro como padrão.
   - Fundo preto de verdade #050608; superfícies #0E1014 com borda #1A1D24; texto #F3F4F7 / #9AA0AE / #6B7181.
   - Cores de estado: azul de ação #3361FF; âmbar #FFB627 = precisa do seu OK; vermelho #FF4D6A = erro; verde #2BD47F = pronto.
   - Agentes: Correio #5B8CFF, Código #8C6BFF, Sentinela #45E2BE, Foco #A98BFF.
2. Tipografia:
   - Inter na interface, com títulos 600 e letter-spacing negativo.
   - Instrument Serif itálico SÓ na segunda linha da saudação (no máximo uma frase por tela).
   - JetBrains Mono nos rótulos, horários e fontes.
   - As três ficam LOCAIS (fontsource ou .woff2 em apps/web/public/fonts, com as licenças OFL). Nada de CDN.
3. Componentes:
   - Navegação em pílula com o item ativo azul.
   - Botão principal branco em pílula; botão secundário escuro com borda.
   - Selos de estado só com contorno; filtro segmentado.
   - Cartões com raio de 20 a 22 px; brilho de cor (radial suave) só nos 3 cartões de resumo.
   - Ilha preta do Dot no topo.
4. Tema claro: continua funcionando, derivado dos mesmos tokens, mas o padrão é o escuro.

D-013 IA:
1. Groq é o provedor ativo: gpt-oss-20b para classificar; gpt-oss-120b para resumo e perguntas.
2. Cloudflare Workers AI fica como fallback opcional, pelo binding env.AI, desligado até passar na avaliação.
3. Gemini, OpenRouter, Mistral, SambaNova e Z.ai ficam registrados e DESLIGADOS. Gemini nunca recebe dado privado.
4. GitHub Models (encerrado), Cerebras e Together NÃO são tratados como gratuitos.
5. Nenhuma rota paga, nenhum cartão, nenhuma recarga automática.

## 2. Parte A — motor do Dot

packages/core/src/dot/ (TypeScript puro, sem DOM, testável):
- geometry.ts: bodyPoints(m), proj, onSphere, bodyPt e as constantes (CY 113, RX 83, RY 64, SPH 80, base 177, viewBox 260×220).
- physics.ts: spring(x, v, alvo, k, c, h) e smooth(rest, dt) = 1 − rest^dt.
- states.ts: repouso, pensando, perguntando, trabalhando, esperando OK, erro (com entrada própria), desconectado e dormindo.
- reactions.ts:
  - reações: oi, concluído, surpreso, carinho, tonto, cutucão, empurrão e absorver;
  - poses paradas (STILL);
  - bloqueios: carinho e tonto ficam bloqueados em erro, aprovação e pergunta.
- engine.ts: DotEngine { setState, react, setAccessory, look, step(dt) com subpassos de 120 Hz, frame(): DotFrame }. RNG com semente injetável. O DotFrame só tem números e ids.

apps/web/src/dot/:
- art.ts: olhos em traço de pincel, selos e partículas.
- accessories.ts: boné, óculos, fone e anel, com sombra de contato.
- DotView.tsx:
  - monta o SVG UMA vez e, a cada quadro, só atualiza atributos por refs;
  - nada de re-render do React e nada de innerHTML por quadro (o protótipo usa innerHTML nos acessórios: corrija);
  - ids SVG únicos por instância (useId).
- ticker.ts: um único requestAnimationFrame para todas as instâncias; pausa com a aba oculta e fora da tela. Avatares pequenos só animam quando o estado muda.

Ligação com o app:
- AgentVisual.semantic → estado do motor; success vira react("success").
- Adicione o semântico "question" ao núcleo de forma aditiva, logo abaixo de waiting, e atualize os testes.
- Acessórios: mail_cap → boné, glasses → óculos, headphones → fone. O anel da Sentinela só aparece enquanto ela verifica.
- Carinho (HeartEmitter/affection) → react("love"), respeitando allowCosmetic e o cooldown.
- Toque → "poke"; 3 toques em 0,9 s → "dizzy" (cooldown de 5 s).
- As fases da absorção do núcleo comandam react("absorb").

## 3. Parte B — novo visual e PWA (siga as telas 01 a 05)

Shell web (tela 01):
- Barra lateral:
  - logo "opendot" com o rosto do Dot;
  - navegação: Meu dia, Rotinas, Conexões, Mascote;
  - lista "Seus agentes" com mini-Dots usando acessório e cor, e um ponto de status;
  - cartão "IA hoje 12/50 · Custo R$ 0" com dados reais do uso.
- Topo: data em mono, ilha do Dot centralizada mostrando o que o agente está fazendo, e a busca "Pergunte ao Dot ⌘K".

Meu dia:
- "Bom dia, João." mais uma linha em serif itálico gerada a partir do estado real ("Três coisas pedem você." / "Tudo calmo por aqui."), com o Dot grande ao lado.
- 3 cartões de resumo com brilho (e-mails revisados, precisam de você, sites no ar), com dados reais.
- Feed "Hoje" com o filtro Tudo / Precisa de você / Fontes.
- Coluna lateral com as próximas rotinas e as fontes do resumo.
- Dados de demonstração continuam só em demo.ts e rotulados.

Celular (telas 02 e 03), abaixo de 760 px:
- some a barra lateral;
- o Dot fica grande no centro, com os agentes em pílulas roláveis e os cartões abaixo;
- a navegação vira uma pílula flutuante embaixo, com alvos de pelo menos 44 px e respeitando env(safe-area-inset-bottom).

Aprovação (tela 03), uma tela para cada aprovação pendente:
- o Dot em âmbar com o selo "!" e o título "Posso enviar esta resposta?";
- o texto EXATO que será enviado, com a frase "A aprovação vale só para este texto exato.";
- o bloco "Por que eu sugeri";
- os botões Aprovar e enviar / Editar / Negar, ligados ao núcleo de aprovações (hash + CAS). Editar gera um novo hash e exige nova aprovação.
- O Gmail continua só leitura: sem o escopo de envio, "Aprovar e enviar" mostra "Envio ainda não habilitado" e não envia nada.

Carregamento (tela 04):
- SplashScreen no boot até sessão + feed carregarem (mínimo 1,2 s, fade de 250 ms).
- O DotView faz o "oi" com mãozinhas, e embaixo aparece "opendot" com o pontinho em degradê #36D8F4 → #3F7BFF → #9E83FF.
- role="status", com o rótulo "Carregando Open Dot". Com movimento reduzido, pose parada.

Sistema (tela 05): transforme em tokens CSS (cores, raios, espaçamentos, tipografia) num único arquivo de tema e use em todo o app. Nenhuma cor solta nos componentes.

PWA:
- manifest.webmanifest: nome "Open Dot", short_name "opendot", display standalone, theme e background #050608, ícones 192/512 e maskable gerados a partir do rosto do Dot.
- meta theme-color e apple-touch-icon.
- Service worker simples que só guarda em cache o shell estático (nunca respostas de /api nem dados de e-mail) e mostra o estado offline que já existe.
- Tudo gratuito, servido pelo mesmo Worker.

## 4. Parte C — camada de IA (pesquisa de 14/10/2026)
O roteador atual (packages/core/src/ai) já cobre allowlist, orçamento atômico, 429/Retry-After, timeout, circuit breaker e bloqueio de dado privado sem ZDR. Inventarie antes de mudar e não regrida nada disso.

1. Registro de provedores (providers/registry). Para cada provedor:
   - endpoint fixo e IDs de modelo permitidos;
   - capacidades TESTADAS (json, pt-BR, streaming);
   - classe de cobrança (só free_tier) e classes de dado permitidas;
   - ficha de privacidade: retenção, uso para treino, controles e data da revisão;
   - verifiedAt.
   Os limites RPM/RPD/TPM/TPD saem do código e vão para a configuração (env/onboarding), preenchidos com os valores do console da conta. Vale sempre o mais restritivo.
2. Rotas conforme a D-013. O fallback do Workers AI usa um modelo elegível ao plano Free. Não adicione o pacote openai: mantenha o cliente fetch atual.
3. Erros:
   - 401/403: pausa a credencial;
   - 402: desliga a rota;
   - 429: respeita Retry-After;
   - 5xx/timeout: no máximo 1 nova tentativa com backoff;
   - finish_reason "length" ou JSON inválido: uma reparação controlada; se falhar de novo, a tarefa é marcada como falha.
   Fallback só para rota com política de dados igual ou mais restrita. Registre o modelo efetivo, o requestId, o usage e a duração, sem conteúdo.
4. Groq: use max_completion_tokens. Nos gpt-oss, use raciocínio baixo nas classificações, se a API da conta aceitar o parâmetro (confira em console.groq.com/docs). O raciocínio conta no orçamento.
5. Dados:
   - classes: público, privado e restrito; "desconhecido" conta como privado;
   - antes de qualquer chamada, remova senhas, códigos de verificação, tokens e links de login (sem prometer anonimização perfeita);
   - restrito nunca vai para a IA;
   - envie primeiro remetente, assunto e trecho; o corpo só quando for necessário.
6. Triagem: mantenha importante / revisar / baixa prioridade, com justificativa e IDs de evidência. Nunca arquive nem apague nada automaticamente.
7. Tela de provedores (em Conexões):
   - mostra nome, estado, modelo, tipo de franquia, consumo do dia, última verificação e classes permitidas;
   - botões: "Testar com exemplo fictício", "Desativar" e "Trocar credencial" (este último abre as instruções do setup:cloud; a chave nunca é digitada no app web nem exibida inteira);
   - "Conectado" quer dizer teste autenticado OK, não aprovação de privacidade;
   - cota esgotada mostra mensagem específica e deixa a tarefa pendente.
8. Avaliação (scripts/eval-ai):
   - dataset sintético versionado: 60 e-mails em pt-BR (ambíguos, spam convincente, datas relativas, duplicatas, informais), 20 logs de CI, 10 incidentes HTTP e 10 tentativas de prompt injection;
   - metas: recall ≥ 95% nos importantes, ≥ 99% de JSON válido, toda fonte apontando para IDs reais, zero ação não autorizada, zero segredo em payload ou log, zero rota paga;
   - nos testes, roda com um provedor falso; com a conta real, só quando o João pedir;
   - gera um relatório por provedor.
9. Sem nenhuma rota elegível: o feed mostra fontes, assuntos e a classificação por regras, com "Resumo por IA pendente". Nunca um sucesso falso.
10. Atualize .env.example e docs/ACOES_DO_JOAO.md. O checklist do João: conta Groq gratuita, ativar ZDR, chave pelo setup:cloud, conferir modelos e limites, teste fictício e piloto de 7 dias só leitura.

## 5. Orçamento e acessibilidade
- Desempenho: 60 fps e no máximo 2 ms de script por quadro com um Dot grande num Mac Intel (meça e registre). Zero quadros com a aba oculta.
- prefers-reduced-motion: poses paradas, sem partículas.
- Contraste de texto ≥ 4,5:1 no escuro e no claro.
- O aria-label do Dot muda com o estado. Erro sempre acompanhado de texto. Foco visível em tudo.
- Sem rolagem horizontal em 320 e 390 px.

## 6. Testes
- core (node:test):
  - nenhum NaN em 10 mil passos; as molas acomodam;
  - toda reação volta à base; os bloqueios funcionam;
  - a absorção devolve m = 0; o giro volta a 0;
  - no máximo 18 partículas; movimento reduzido sem partículas;
  - mesma semente = mesmos quadros;
  - "question" no resolvedor;
  - IA: 402 desliga a rota; 5xx tenta só mais uma vez; resposta truncada falha; desconhecido conta como privado; segredos removidos antes da chamada; nenhuma rota paga escolhida.
- test:ui:
  - o splash aparece e some; o olhar segue o ponteiro;
  - toque, tonto e bloqueio no erro; os acessórios aparecem;
  - a tela de aprovação aprova, edita e nega;
  - navegação móvel em 390 px;
  - manifest e service worker registrados;
  - a tela de provedores roda o teste fictício contra o provedor falso;
  - o chunk do three.js não carrega no caminho padrão;
  - sem erros de console.
- Prints lado a lado das referências × app:
  - as telas 01 a 04 no escuro;
  - o Dot em repouso, oi, erro, carinho, tonto, absorção e com os 4 acessórios.
  Corrija as divergências antes de seguir.

## 7. Como trabalhar
Fases, cada uma com npm run check verde e commit local em português:
1) core/dot + testes;
2) DotView, arte e acessórios;
3) ligação com o app + splash;
4) tokens, fontes locais e shell web (tela 01);
5) layout móvel + aprovação (telas 02 e 03);
6) PWA;
7) chave do GLB, desempenho e prints;
8) Parte C (registro, erros, privacidade, tela de provedores, avaliação).
Se o contexto apertar, termine a fase atual, escreva a "próxima ação exata" em docs/STATUS.md e pare.

## 8. Regras
- Não altere ~/Documents/mascot-desk nem outros projetos.
- Sem serviços pagos, sem deploy, sem push, sem chamadas reais à IA (só o provedor falso).
- Não apague arquivos.
- Nunca peça chaves no chat nem as coloque em código, logs ou commits.
- Atualize docs/STATUS.md separando testado de verdade, sem teste real, simulado e planejado.
- Ao final, responda em português com o que mudou, os prints comparativos, o relatório de avaliação com o provedor falso e o que ainda difere das referências. Sons ficam para depois.
