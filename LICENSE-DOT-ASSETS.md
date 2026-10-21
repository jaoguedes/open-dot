# Licença do Dot — todos os direitos reservados

> **Rascunho sem revisão jurídica.**

SPDX: `LicenseRef-OpenDot-Mascot-All-Rights-Reserved`

Copyright © 2026 João Pedro Guedes. Todos os direitos reservados.

O **Dot** é o mascote do Open Dot: o personagem, sua aparência (forma, olhos, blush, proporções, paleta, materiais e acessórios), suas animações, sons e ícones, e o código e os arquivos que o desenham ou o produzem.

## O que está coberto

Os arquivos listados em `scripts/lib/dot-paths.mjs` (`DOT_PATHS`), entre eles:

- `apps/web/src/dot/`, `apps/web/src/dot3d/`, `apps/web/src/components/Dot2D.tsx`, `apps/web/src/components/Dot3D.tsx`, `apps/web/src/mascot/dot.ts`
- `packages/core/src/dot/` (motor do Dot)
- `assets/dot/`, `assets/icones/`, `blender/`
- `apps/web/public/icons/`, `apps/web/public/favicon.ico`, `apps/web/public/sounds/`, `apps/runner/src-tauri/icons/`, `scripts/sounds/`
- imagens, referências e capturas do Dot em `docs/referencias/` e `docs/capturas/`
- os testes do próprio Dot listados em `DOT_PATHS`

## O que você pode fazer

- Ver e ler esses arquivos neste repositório e executá-los **sem modificação**, como parte do Open Dot oficial, para uso pessoal ou para avaliar o projeto.

## O que você não pode fazer sem autorização escrita

- copiar, redistribuir ou publicar o Dot ou partes dele, em qualquer formato;
- criar derivados (variações, recolorações, “fan arts” comerciais, modelos 3D, adesivos, ícones) ou treinar modelos de IA com ele;
- usar o Dot em outro produto, serviço, fork, marca ou material de divulgação;
- usar o Dot de forma que sugira que o seu projeto é o Open Dot oficial.

A AGPL-3.0 do resto do código **não** se aplica a estes arquivos, e a licença comercial do código também não os inclui.

## Forks

Forks devem remover o Dot e usar o **Marcador**, mascote genérico sob AGPL-3.0 (`apps/web/src/mascot/placeholder/`, ícones em `assets/placeholder/icons/`):

```bash
OPEN_DOT_MASCOT=placeholder npm run build
npm run check:without-dot
```

O passo a passo está em `docs/FORKS.md`.

Pedidos de autorização: **[CONTATO_A_DEFINIR]**.
