# Diário da rodada 4 — ícone, amarelo e vidro (15/10/2026)

Decisões do João (não reabrir): acento amarelo do ícone (#FFBC03), fundo escuro (#050608), Dot e splash sobre fundo escuro, vidro só na caixa “Pergunte ao Dot” e no dock. Nenhuma funcionalidade muda. Decisão registrada em `docs/DECISOES.md` (D-023).

## Antes de mudar

- Capturas “antes”: `docs/capturas/rodada4/antes/` (12 telas + busca, escuro e claro, 390×844, build de `524f77b`). `scripts/ui-rodada4.mjs` já passava 2/2 (sem rolagem horizontal).
- `tests/theme-rodada4.test.ts` contra o código antigo: **2/8** (os dois de contraste dos tokens já passavam com o azul; falhavam: vidro escuro, vidro claro, acento/laranja, azul antigo, fallback do vidro, manifest).
- Azul antigo (`#3361FF`, `#6E95FF`, `#2F56E0`, `#5B8CFF`, `rgba(51,97,255)`) em `apps packages scripts blender assets tests`: **10 linhas** (9 em `theme.css`, 1 em `DotView.tsx`).

## O que mudou

| Item | Mudança | Teste (antes → depois) |
|---|---|---|
| 3.1 Ícones | Conjunto de `/Users/joaoguedes/dot-icones-set/` copiado sem alteração para `apps/web/public/icons/` (apple 180, 192, 512, maskable 512, favicon 16/32/256); mestre em `assets/icones/dot-icone-1024.png`; `favicon.ico` (16/32/256, PNG embutido) por `scripts/icons/make-ico.mjs`; `favicon.svg` antigo removido; `index.html` e manifest com `?v=4`; o service worker usa cache com o hash do build e apaga os antigos ao ativar, e o shell agora pré-carrega `favicon-32.png?v=4`. theme-color e background_color seguem #050608. O gerador antigo (`make-icons.mjs`) saiu. | manifest (tamanhos, maskable, theme-color) ✖ → ✔; `apps/web/test/icons.test.ts` reescrito (tamanhos, sem transparência, ICO, mestre) |
| 3.2 Tokens | Escuro e claro conforme a decisão; `--info` passou ao amarelo do link (era o azul antigo); `--glow-need` em laranja; `--wordmark-dot` em amarelo. `summary` e o contorno da opção ativa da busca deixaram de usar o amarelo como texto/contorno no claro. No claro, preenchido amarelo tem contorno 1px `--link` (o amarelo tem 1,55:1 sobre o fundo claro). | contraste dos tokens: ✔ → ✔ (text/bg, text-2/surface, on-accent/accent, link/surface, link/bg, warn/surface, text/surface-2, focus/bg, focus/surface) |
| 3.3 Azul solto | Ver contagem abaixo. | “sem azul antigo” ✖ → ✔ |
| 3.4 Seleção e foco | `::selection` #FFBC03/#1A1400; `accent-color: var(--accent)`; `--focus` = acento no escuro, `--link` no claro. | regex no teste do vidro ✖ → ✔ |
| 3.5 Vidro | `.composer` e `.dock`: `color-mix(surface 88%, transparente)`, `blur(16px) saturate(1.5)`, borda 16% do texto, sombra suave, enviar em `--accent`/`--on-accent`, placeholder em `--text-2`. Fallback a 94% em `@supports not (backdrop-filter)`, em `prefers-reduced-transparency` e com a preferência do app. **88% e não 52%:** com 52% o texto principal fica 3,45:1 e o secundário 1,45:1 quando o corpo branco do Dot passa por baixo (escuro); 88% é o mínimo que passa 4,5:1 em texto e texto secundário nos dois modos. Duas camadas de desfoque por tela (a ilha não usa). Teclado do iPhone: `--kb` via `visualViewport` sobe a caixa. | vidro escuro/claro ✖ → ✔; fallback ✖ → ✔; `apps/web/test/keyboard-inset.test.ts` |
| 3.6 Navegador | `npm run ui:rodada4` (no deploy e na CI): Meu dia, os 9 agentes, Aprovação, Conexões e Busca, escuro e claro, sem rolagem horizontal; capturas “depois” em `docs/capturas/rodada4/depois/`. Fases A, D (axe nos dois temas), E, F e G seguem verdes com as cores novas. | 2/2 → 2/2 |

## Azul antigo: 10 → 2

O que ficou é **arte do Dot**, não acento, e não foi mudado sem avisar:
- `apps/web/src/theme.css` `--agent-correio: #5b8cff` — cor de identidade do Correio (boné azul).
- `apps/web/src/dot/DotView.tsx:717` — o arquivo azul que o Dot “absorve”.

Também arte, fora do padrão pedido e sem mudança: brilho de repouso do Dot `#3F7BFF` (`packages/core/src/dot/states.ts`, `engine.ts`), `--glow-mail` (brilho azul-ciano do cartão do Correio), cores do Blender e as páginas de referência em `docs/referencias/`.

## Não verificado

- No iPhone: ícone novo (remover o app e adicionar de novo), leitura da caixa de vidro, seleção, modo claro, a caixa subindo com o teclado e ausência de jank. O emulador do Chromium não reproduz o teclado do iOS.
- Força do desfoque: decisão do João depois de ver no aparelho.
- O `maskable-512` é igual ao ícone comum e a bochecha direita passa da zona segura de 80% do Android: decisão de arte do João.
