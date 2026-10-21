# Inventário para a revisão jurídica (21/10/2026)

Levantamento factual para o advogado. Não cria nem interpreta cláusulas. **PENDENTE** = origem ou licença não comprovada no repositório; nada foi removido.

## (a) Assets que não são código

| Asset | Caminho | Origem registrada | Licença | Situação |
|---|---|---|---|---|
| Fontes Inter (3 pesos) | `apps/web/public/fonts/Inter-*.woff` | Projeto Inter (Rasmus Andersson) | OFL-1.1 (texto em `LICENSE-Inter.txt`) | ok |
| Fonte Instrument Serif | `apps/web/public/fonts/InstrumentSerif-Italic.woff2` | Instrument | OFL-1.1 (`LICENSE-Instrument-Serif.txt`) | ok |
| Fonte JetBrains Mono | `apps/web/public/fonts/JetBrainsMono-Medium.woff2` | JetBrains | OFL-1.1 (`LICENSE-JetBrains-Mono.txt`) | ok |
| Sons do Dot (13 `.mp3`) | `apps/web/public/sounds/` | Sintetizados do zero por `scripts/sounds/make_dot_sounds.py` (README da pasta) | Dot — só visualização | ok |
| Ícones do app e favicon | `apps/web/public/icons/`, `apps/web/public/favicon.ico` | “Conjunto de ícones do mantenedor”, mestre em `assets/icones/dot-icone-1024.png` (commit `8ae305d`, 15/10/2026); **ferramenta de criação não registrada** | Dot — só visualização | **PENDENTE**: confirmar autoria e ferramenta (se houve gerador de imagem, conferir os termos dele) |
| Ícone mestre | `assets/icones/dot-icone-1024.png` | idem | Dot | **PENDENTE** (mesmo motivo) |
| Ícones do Runner | `apps/runner/src-tauri/icons/` | derivados do ícone mestre | Dot | **PENDENTE** (depende do mestre) |
| Modelos 3D do Dot (`.glb`) e posters | `assets/dot/` | Gerados por `blender/build_dot.py` a partir de `blender/dot_spec.py` (código do repositório); Blender é só ferramenta | Dot | ok |
| Pranchas de referência do Dot | `docs/referencias/dot_absorcao.png`, `dot_funcoes_acessorios.png` (commit `e0de064`, coautor Cursor) | **origem não registrada** (aparência de imagem gerada) | Dot | **PENDENTE**: confirmar autoria/ferramenta |
| Páginas de referência do Dot | `docs/referencias/dot_*.html` | escritas no projeto | Dot | ok |
| Referências de design em HTML | `docs/referencias/design/*.html` | escritas no projeto; carregam Inter do Google Fonts por link (não versionam a fonte) | AGPL (docs) | ok |
| Capturas de tela do app | `docs/capturas/` (58 PNG) | geradas pelos testes do próprio app, dados fictícios | Dot (mostram o Dot) | ok |
| Ícones do Marcador | `assets/placeholder/icons/` | gerados por `scripts/icons/make-placeholder-icons.mjs` | AGPL-3.0 | ok |
| Referências visuais externas | `docs/referencias/ux-pilot/` | ferramenta de terceiros | — | **não versionadas** (em `.git/info/exclude`) |

## (b) Marcas e logos de terceiros

- Nenhum logo de terceiros está versionado (busca por arquivos de imagem com nomes de marca: nenhum). O conjunto de ícones (`Icons.tsx`) tem só glifos genéricos (casa, relógio, tomada, lupa, etc.).
- O produto se chama “Open Dot” (`apps/web/index.html`, `manifest.webmanifest`, `package.json`) e “Open Dot Runner” (`tauri.conf.json`). Nenhuma marca de terceiros é usada como nome ou logo.
- Anthropic, OpenAI, Google, Cursor/Anysphere, Cloudflare, Turso, Vercel, GitHub, Groq e outros aparecem **só em texto**, para identificar integrações. Mecanismos na interface usam nome em texto e um ponto colorido próprio (paleta do projeto), não logos.
- Avisos de não afiliação: `docs/orquestrador/POLITICA_DE_FERRAMENTAS.md`, `orchestrator/catalog/ferramentas.json` (`aviso`) e `docs/release/v0.2.0-beta.md`.

## (c) Licenças das dependências

Fonte: `docs/licencas/` (SBOM CycloneDX npm e Cargo; `README.md` com o resumo).

- **npm (290 pacotes):** execução — React, React DOM, three, zod (MIT) e pdfjs-dist (Apache-2.0). Desenvolvimento — MIT, Apache-2.0, ISC, BSD; `axe-core`/`@axe-core/playwright` (MPL-2.0), `caniuse-lite` (CC-BY-4.0), `argparse` (Python-2.0), `minimatch` (BlueOak-1.0.0), fontes `@fontsource/*` (OFL-1.1). Nenhuma de desenvolvimento é distribuída no app.
- **Cargo (508 crates):** MIT/Apache-2.0 na maioria; MPL-2.0 (`cssparser`, `selectors`, `dtoa-short`, `option-ext`) é copyleft por arquivo; Unicode-3.0, CDLA-Permissive-2.0, Zlib, BSL-1.0 permissivas; `r-efi` com opção LGPL entre alternativas permissivas.
- **Não permissivas ou com condição:** MPL-2.0 (Cargo, distribuída no Runner): compatível com AGPL e com licença comercial, desde que os arquivos MPL continuem MPL e o código deles fique disponível. CC-BY-4.0 só em desenvolvimento. **Nenhuma incompatível com AGPL-3.0-only.**
- Inventário de 20/10/2026; dependências mudam com o Dependabot. Regerar com `node scripts/license/npm-sbom.mjs` e `node scripts/license/cargo-inventory.mjs` antes da revisão.

## (d) Onde vive cada texto jurídico e o que depende do João

Os quatro modelos abaixo começam com “Modelo ainda sem revisão jurídica; pode mudar antes de qualquer contrato ou contribuição ser aceita.” (acrescentado em 21/10/2026). `LICENSE` não recebeu o aviso: é o texto oficial da AGPL-3.0, que não pode ser alterado.

| Texto | Arquivo | Campos que dependem de decisão do João (não preenchidos) |
|---|---|---|
| Licença do código | `LICENSE` (AGPL-3.0, texto oficial, sha256 `0d96a4ff…abcb0`), `LICENSES/AGPL-3.0-only.txt` | — |
| Licença do Dot | `LICENSE-DOT-ASSETS.md`, `LICENSES/LicenseRef-OpenDot-Mascot-All-Rights-Reserved.txt`, `LICENSE` em cada pasta do Dot | lei aplicável e foro; prazo e forma de autorização de uso; tratamento de forks que já copiaram o Dot |
| Licença comercial | `COMMERCIAL-LICENSE.md` | base de cálculo dos royalties (receita, por usuário, fixo); prazo e renovação; território; lei aplicável e foro; suporte incluído ou não |
| CLA | `CLA.md` | lei aplicável e foro; versão/data de vigência; forma de aceite (hoje: frase no PR); se pessoas jurídicas assinam versão própria |
| Marca | `TRADEMARK.md` | registro da marca (não há); critérios de autorização; lei aplicável e foro |
| Atribuições | `NOTICE` | — |
| Mapa por caminho | `REUSE.toml` | — |
| Contato público | `SECURITY.md`, `COMMERCIAL-LICENSE.md`, `LICENSE-DOT-ASSETS.md`, `TRADEMARK.md`, `CODE_OF_CONDUCT.md` | definido em 21/10/2026 |
