# DESIGN.md — Open Dot v0.3

Fonte única dos tokens e regras visuais do app web, do Runner e do site. Código: `apps/web/src/theme.css` (variáveis CSS) e `packages/core/src/mechanisms.ts` (cores de agente). Decisões: D-023 (acento amarelo), D-027 (redesign e cor do agente), D-028 (reações do Dot).

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#07080C` | Fundo do app |
| `--panel` | `#0A0C11` | Trilho, barra inferior, barra de título do Runner |
| `--surface` | `#0E1017` | Cartão |
| `--surface-2` | `#141722` | Campo, código, dígito do pareamento |
| `--border` | `rgba(255,255,255,.07)` | Borda de cartão e divisória |
| `--border-strong` | `rgba(255,255,255,.12)` | Borda de botão secundário e campo |
| `--text` | `#F3F4F8` | Texto principal |
| `--text-2` | `#A3A8BA` | Texto secundário |
| `--text-3` | `#8E93A6` | Rótulo mono, legenda |
| `--ok` | `#34D17B` | Pronto, conectado (só com confirmação real) |
| `--approve` | `#1C834E` | Fundo do botão Aprovar. O prompt pedia `#1F8F55`, mas branco sobre ele dá 4,10:1 (abaixo de AA); `#1C834E` dá 4,77:1 e 3,99:1 contra o cartão. |
| `--amber` | `#F5B342` | Aviso, “DADOS DE EXEMPLO”, carga alta |
| `--err` | `#F0626E` | Erro (sempre com texto) |
| `--blue` | `#5B8CFF` | Informação, etapa atual, Dot sem agente |
| `--accent` | `#FFBC03` | Acento da marca (D-023): foco e destaque |

### Agentes (D-027)

| Agente | Cor | Observação |
|---|---|---|
| Codex | `#A48BFF` | |
| Claude Code | `#FF9A55` | |
| Cursor | `#62AAFF` | |
| Sentinela | `#4FE3B6` | |
| Foco | `#F28FD0` | Escolhida para o v0.3: contraste 8,9:1 sobre `#07080C` e 8,4:1 sobre `#0E1017`; distante do rosa das bochechas (`#FF8FB8`) em matiz e luminância o bastante para não se confundir no disco. |
| Sem agente | `#5B8CFF` / brilho original `#3F7BFF` | Dot padrão |

Verde fica reservado ao futuro WhatsApp (identidade) e às cores semânticas; nenhuma cor de agente é verde.

## Tipografia

- **Plus Jakarta Sans** (corpo, títulos 800 com tracking −0,03 em), auto-hospedada em `apps/web/public/fonts/` (400, 600, 800; recorte latino; OFL-1.1, texto em `LICENSE-Plus-Jakarta-Sans.txt`). Pilha de reserva: Inter (já local), `system-ui`.
- **JetBrains Mono** 500 para rótulos em caixa-alta espaçada (10,5 px, `letter-spacing: .18em`), horários, hashes e branches. Ex.: “SEU CONTEXTO. UM COMPANHEIRO.”
- Sem CDN de fontes em produção.

## Ícones

Traço próprio em SVG inline: `stroke-width 1.7`, `stroke-linecap/linejoin round`, `fill none`, `currentColor`, caixa 24×24. Sem emoji e sem logotipos de marcas: GitHub, Vercel e Gmail usam ícone genérico + rótulo de texto.

## Estrutura

- **Computador (≥ 1024 px):** trilho recolhido de 84 px só com ícones (Dot 48 px; Meu dia, Workspace, Runner, Correio e Notícias, Rotinas, Conexões, Memória, Mascote; divisor; discos de agente; avatar). Abre ao passar o mouse, no foco ou pelo botão, **sobrepondo** o conteúdo (248 px, com rótulos); fecha com Esc ou clique fora; “fixar aberto” fica no navegador. Cada ícone tem `aria-label` e dica.
- **Topo:** busca “Pergunte ao Dot…” com ⌘K, chip “DADOS DE EXEMPLO” na demonstração, sino.
- **Celular (< 1024 px):** barra inferior de 4 itens (Workspace, Runner, Correio, Mais); “Mais” abre as outras telas. Sem menu lateral. Cabeçalho com Dot de 44 px.
- **Densidade:** o Dot grande aparece uma vez por tela (Workspace ~190 px, Runner ~150 px, celular 100–140 px). Dot de identidade por agente só em listas de agentes (64 px; 62 px em Conexões no celular). No resto, disco simples com a cor do agente.

## Componentes base (`apps/web/src/components/ui.tsx`, `apps/web/src/v03.css`)

- **Cartão:** `--surface`, borda `--border`, raio 18 px, padding 16–28 px.
- **Botão:** 44 px de altura (alvo de toque), raio 12 px; primário branco com texto `#0B0C10`; secundário `rgba(255,255,255,.04)` com borda; Aprovar `--approve` com texto branco; desabilitado com `aria-disabled` e motivo em texto.
- **Chip:** 30 px, raio 15 px, borda `--border-strong`, texto `--text-2`.
- **Disco de agente:** círculo com a cor do agente e a inicial em `#0B0C10`; o nome sempre ao lado (cor nunca é o único sinal).
- **Rótulo mono:** JetBrains Mono, caixa-alta, `--text-3`.

## Regras

1. Contraste AA em texto e controles; alvos ≥ 44 px no celular; foco visível (`--focus`); `prefers-reduced-motion` respeitado; axe sem achados sérios.
2. Estado honesto: “Conectado”, “Enviado”, “Concluído” só com confirmação real. Demonstração sempre com o chip “DADOS DE EXEMPLO”.
3. O Dot nunca ganha boca, sobrancelhas ou balão. Cor do agente só pelo `tint`; reações só com estado real e motivo em texto.
4. Sem rolagem horizontal de 360 a 1440 px; texto não cortado.
5. Desempenho: o Dot para com a aba/janela oculta e respeita o teto de quadros do perfil (ver `docs/performance/ORCAMENTO.md`).
