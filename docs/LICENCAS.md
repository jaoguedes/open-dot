# Inventário de licenças

| Item | Versão | Licença | Uso | Observação |
|---|---|---|---|---|
| React / React DOM | 19.2.8 | MIT | Interface | — |
| zod | 3.25.76 | MIT | Validação de entrada e configuração no worker | — |
| esbuild | 0.28.2 | MIT | Build (dev) | — |
| TypeScript | 6.0.3 | Apache-2.0 | Typecheck (dev) | — |
| tsx | 4.23.12 | MIT | Rodar scripts e testes TS (dev) | — |
| @types/react, @types/react-dom, @types/node | 19.3.0 / 19.3.0 / 22.x | MIT | Tipos (dev) | — |
| Wrangler | 4.x (via `npx`) | MIT OR Apache-2.0 | Deploy | Não fica fixado no lockfile; fixar no primeiro `npm install` com rede |
| Playwright | (ambiente) | Apache-2.0 | `npm run test:ui` | Opcional: `npx playwright` |
| **Inter** 4.0 (Regular, Medium, SemiBold; recorte latino) | 4.0 | SIL OFL 1.1 | Fonte local da interface | Texto completo em `apps/web/public/fonts/LICENSE-Inter.txt` |
| **Plus Jakarta Sans** (400, 600, 800; recorte latino, via `@fontsource/plus-jakarta-sans` 5.3.0) | 2.7 | SIL OFL 1.1 | Fonte do corpo no v0.3, auto-hospedada (sem CDN) | Texto completo em `apps/web/public/fonts/LICENSE-Plus-Jakarta-Sans.txt`; licença conferida no pacote em 22/10/2026 |
| Blender | 4.5.14 LTS | GPL-3.0 | Ferramenta de criação (não é distribuída com o app) | Os arquivos produzidos (`.blend`, `.glb`) pertencem ao autor |
| **Dot** (personagem, código de desenho, `.blend`, `.glb`, posters, ícones, sons) | — | Licença só de visualização, todos os direitos reservados (`LICENSE-DOT-ASSETS.md`) | Mascote | Forks trocam pelo Marcador (AGPL) |
| Ícones da interface | — | Próprios (desenhados no código) | Interface | Sem biblioteca de terceiros |
| Sons do Dot (`apps/web/public/sounds/*.mp3`) | — | Originais, sintetizados por `scripts/sounds/make_dot_sounds.py` | Sons opcionais (desligados por padrão) | Nenhum áudio de terceiros |

Inventário completo das dependências transitivas e SBOM CycloneDX: `docs/licencas/` (npm e Cargo).
