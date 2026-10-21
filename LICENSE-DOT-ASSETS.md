# Licença do Dot — só visualização (todos os direitos reservados)

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

## Licença “só visualização”

O Dot **continua visível** no app oficial e neste repositório. A licença é só de visualização:

**Permitido**

- ver e ler esses arquivos neste repositório;
- executar o app oficial do Open Dot, **sem modificações** no Dot, inclusive na sua própria instância pessoal configurada a partir deste repositório.

**Proibido sem autorização escrita**

- **copiar** o Dot ou partes dele para fora deste repositório e do app oficial;
- **redistribuir** ou publicar o Dot em qualquer formato, inclusive dentro de um fork ou de um pacote do app;
- **modificar** o Dot ou criar derivados (variações, recolorações, modelos 3D, adesivos, ícones, animações);
- **treinar ou ajustar modelos de IA** com o Dot, ou usá-lo como referência de geração;
- **uso comercial** do Dot, inclusive em produto, serviço, marca ou divulgação;
- usar o Dot de forma que sugira que o seu projeto é o Open Dot oficial.

A AGPL-3.0 do restante do código **não** se aplica a estes arquivos, e a licença comercial do código também não os inclui.

## Forks e redistribuição

Quem redistribui o app ou faz um fork **deve trocar o Dot**. O padrão do repositório continua sendo o Dot; para a troca existe o **Marcador**, mascote genérico sob AGPL-3.0 (`apps/web/src/mascot/placeholder/`, ícones em `assets/placeholder/icons/`):

```bash
OPEN_DOT_MASCOT=placeholder npm run build
npm run check:without-dot
```

O passo a passo está em `docs/FORKS.md`.

Pedidos de autorização: **jpguedesbarbieri@gmail.com**.
