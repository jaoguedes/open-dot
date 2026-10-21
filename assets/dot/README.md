# Assets publicados do Dot

Esta pasta é preenchida **somente** por `npm run blender:build`, depois que a validação passa:

- `dot-base.<hash>.glb`: corpo, olhos, bochechas, tracinho de absorção, rig, sockets e clipes `body_*` e `face_*`;
- `prop-Prop_*.<hash>.glb`: boné, óculos e fone, um arquivo por peça, ancorados a sockets (sem corpo e sem clipes dentro);
- `fx-*.<hash>.glb`: coração e aro;
- `poster-*.png`: frente, três quartos, lado e frente em 32/64/160 px;
- `manifest.json`: arquivos com hash, nós, morphs, clipes, mapeamento de estados, âncoras, limites e estado da validação.

O build (`scripts/build.mjs`) e o servidor local (`scripts/dev.ts`) copiam o manifesto e os GLB citados por ele para `/dot/` no app. GLB antigos do pipeline são apagados a cada publicação.

**Estado atual:** exportado e validado estruturalmente no Blender 4.5.14 LTS; carrega no app (`Dot3D.tsx`). A aprovação artística é do mantenedor. O arquivo fonte editável (`dot_master.blend`) fica em `blender/out/<build>/` e não é versionado; copie para `blender/dot_master.blend` quando o modelo for aprovado.
