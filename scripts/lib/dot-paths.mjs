// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Arquivos do Dot (código de desenho, motor, arte, sons, ícones e testes do próprio Dot).
 * Licença própria, todos os direitos reservados: LICENSE-DOT-ASSETS.md. Usado pelo
 * scripts/check-without-dot.mjs para provar que o app compila e testa sem eles.
 */
export const DOT_PATHS = [
  "apps/web/src/dot/",
  "apps/web/src/dot3d/",
  "apps/web/src/components/Dot2D.tsx",
  "apps/web/src/components/Dot3D.tsx",
  "apps/web/src/mascot/dot.ts",
  "packages/core/src/dot/",
  "assets/dot/",
  "assets/icones/",
  "blender/",
  "apps/web/public/icons/",
  "apps/web/public/favicon.ico",
  "apps/web/public/sounds/",
  "apps/runner/src-tauri/icons/",
  "scripts/sounds/",
  "docs/referencias/dot_absorcao.png",
  "docs/referencias/dot_funcoes_acessorios.png",
  "docs/referencias/dot_motor.html",
  "docs/referencias/dot_previa.html",
  "docs/capturas/",
  "apps/web/test/dot-art.test.ts",
  "apps/web/test/icons.test.ts",
  "apps/web/test/dot3d.test.ts",
  "apps/web/test/ring.test.ts",
  "apps/web/test/ticker.test.ts",
  "packages/core/test/dot.test.ts",
];

export const isDotPath = (file) => DOT_PATHS.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
