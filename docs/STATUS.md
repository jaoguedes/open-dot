# STATUS — Open Dot

_Atualizado em 14/10/2026 · motor SVG (D-014) no núcleo, testado · visual/PWA/IA das telas aprovadas em andamento._

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
| Persistência | ✅ SQLite · 🟡 Turso | Migrações `0001` e `0002` (uploads) aditivas com prefixo `od_`; tudo filtrado por dono; segredos e trechos de e-mail cifrados (AES-GCM, chave versionada). Cliente Turso HTTP testado contra um servidor Hrana simulado |
| API / Worker | ✅ local · 🟡 Cloudflare | Sessão (cookie HttpOnly), CSRF, feed, rotinas, execuções, uso, conexões, monitores, aprovações, perguntas com fontes, webhook do GitHub, cron |
| Login | ✅ local (dev) · 🟡 Google | Login Google OIDC (PKCE, state, nonce, dono único). A entrada de desenvolvimento só funciona em localhost |
| Gmail (somente leitura) | 🧪 testado com Google simulado · 🟡 real | OAuth com `gmail.readonly`, sync incremental (`historyId` como texto), dedupe, ressincronização após 404, lotes dentro do limite de subrequisições, renovação de token com lease, reconexão única quando revogado, resumo das 08h/17h com links para o Gmail |
| Rotinas 08h/17h | ✅ | Chave única por slot; cron repetido não duplica; após dias offline gera um único resumo “atrasado”; mudar o horário cancela execuções futuras |
| IA | ✅ lógica · ⛔ chave | Allowlist com o Groq; e-mail privado bloqueado até o ZDR ser confirmado; reserva atômica no banco; 429/Retry-After; timeout; circuit breaker; cancelamento; registro de consumo sem conteúdo. Sem chave, tudo cai para regras |
| GitHub | 🧪 webhook testado com eventos simulados · 🟡 GitHub App | Assinatura HMAC, dedupe por delivery, evento fora de ordem não regride, falha de CI vai para o feed. O token de instalação está implementado, sem teste real |
| Vercel | 🟡 | Leitura de `/v7/deployments` a cada ~15 min; deploy com ERROR vai para o feed. Sem escrita |
| Sites (Sentinela) | ✅ | Até 3 URLs HTTPS; bloqueio de IP interno e de redirecionamento; incidente após 3 falhas e encerramento após 2 sucessos; correlação com deploy dita como “sinal, não causa” |
| Interface web | ✅ | Tema escuro padrão (D-015), tokens únicos, Inter/Instrument Serif/JetBrains Mono locais, shell da tela 01, ilha preta no topo, ⌘K, demonstração isolada e rotulada. Claro continua. Layout móvel 02/03 ainda é o menu lateral (fase 5) |
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
| `npm test` | ✅ **67/67** (45 do núcleo, 18 de integração do worker com SQLite real, 4 do cliente Turso/Hrana) |
| `npm run test:blender` | ✅ 5/5 (conversão de cor, validador de GLB com arquivos sintéticos) |
| `npm run build` | ✅ JS da interface 254 KB, CSS 15 KB, fontes 77 KB; bundle do Worker com 135 KB e **sem APIs do Node** |
| `npm run test:ui` | ✅ **36/36** no Chromium: login local → estado vazio real; demonstração rotulada; Inter carregada localmente; 320/390 px e zoom 200% sem rolagem horizontal; menu móvel; tab/skip link/foco visível; ⌘K; movimento reduzido sem animação; carinho não mascara aprovação; sem erros de console |

Riscos cobertos por teste: isolamento por dono, CSRF, state de OAuth reaproveitado, escopo negado, acesso revogado (uma única notificação), webhook com assinatura inválida, entrega duplicada, evento fora de ordem, 429 do Gmail, falha parcial de sincronização, cursor expirado, cron repetido, lease disputado, aprovações concorrentes, orçamento concorrente (memória e SQL), 429 em provedor privado sem envio a outro, timeout e circuit breaker, cancelamento, injeção de prompt, ID de evidência inventado, prioridade visual de erro, cancelamento independente de efeitos, movimento reduzido, segredos ausentes do banco e do health.

**Não foi testado:** OAuth real do Google, Gmail real, Turso real, deploy no Cloudflare (CPU de 10 ms), GitHub App real, Vercel real, Groq real, Blender/GLB, Mac e Windows como app, leitor de tela real e WebGL (ainda não há runtime 3D).

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

## Próxima ação exata

Fase 5 da sessão 14/10: layout móvel (<760 px, telas 02–03) e a tela de aprovação (hash + CAS; Gmail só leitura). Depois PWA (fase 6).

## Como retomar em outra sessão

1. Leia `CLAUDE.md`, este arquivo e `docs/REVISAO_DO_PDF.md`.
2. Rode `npm run check` para confirmar a base.
3. Use `npm run dev` e abra http://localhost:8787 (entrada local de desenvolvimento).
4. Continue pela “Próxima ação exata” e atualize este arquivo ao terminar.
