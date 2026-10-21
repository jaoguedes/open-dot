# Inventário de licenças e SBOM

Gerado em 20/10/2026 a partir dos lockfiles. Não substitui revisão jurídica.

| Arquivo | Conteúdo | Como gerar |
|---|---|---|
| `sbom-npm.cdx.json` | SBOM CycloneDX das dependências npm (290 componentes) | `node scripts/license/npm-sbom.mjs` (sem e-mails de autores) |
| `cargo-licenses.json` | Licença de cada crate do Runner (508), da API pública do crates.io | `node scripts/license/cargo-inventory.mjs` |
| `sbom-cargo.cdx.json` | SBOM CycloneDX mínimo das crates | mesmo script |

## npm

Dependências de execução (vão no app): React, React DOM, three, zod (MIT) e pdfjs-dist (Apache-2.0). Todas permissivas.

Somente desenvolvimento (não são distribuídas): MIT, Apache-2.0, ISC, BSD; `axe-core` e `@axe-core/playwright` (MPL-2.0), `caniuse-lite` (CC-BY-4.0, exige atribuição se redistribuído), `argparse` (Python-2.0), `minimatch` (BlueOak-1.0.0), fontes `@fontsource/*` (OFL-1.1).

## Cargo (Runner)

508 crates, nenhuma sem licença. Predominam MIT/Apache-2.0. Pontos de atenção:

- **MPL-2.0** (`cssparser`, `selectors`, `dtoa-short`, `option-ext`): copyleft por arquivo. Compatível com AGPL e com distribuição comercial, desde que alterações nesses arquivos continuem MPL e o código-fonte deles fique disponível.
- **Unicode-3.0** (`icu_*`, `unicode-ident`), **CDLA-Permissive-2.0** (`webpki-roots`), **Zlib**, **BSL-1.0**: permissivas, com aviso de licença.
- `r-efi` oferece `LGPL-2.1-or-later` como uma das opções; a escolha MIT/Apache-2.0 evita a LGPL.

**Nenhuma dependência é incompatível com AGPL-3.0-only nem impede a licença comercial.**

## Ativos de terceiros

- Fontes Inter, Instrument Serif e JetBrains Mono: OFL-1.1, licenças em `apps/web/public/fonts/`.
- Dot (arte, modelos, sons, ícones): próprios, licença só de visualização (`LICENSE-DOT-ASSETS.md`).
- Marcador e ícones do Marcador: gerados no repositório, AGPL-3.0.
- Nenhuma textura, modelo ou som de terceiros foi encontrado.
