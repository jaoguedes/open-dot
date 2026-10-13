# Assets publicados do Dot

Esta pasta é preenchida **somente** por `npm run blender:build`, depois que a validação passa:

- `dot-base.<hash>.glb`: corpo, olhos, bochechas, tracinho de absorção, rig, sockets e clipes `body_*` e `face_*`;
- `prop-Prop_*.<hash>.glb`: boné, óculos e fone, um arquivo por peça, ancorados a sockets;
- `fx-*.<hash>.glb`: coração e aro;
- `poster-*.png`: frente, três quartos, lado e frente em 32/64/160 px;
- `manifest.json`: arquivos com hash, nós, morphs, clipes, mapeamento de estados, âncoras, limites e estado da validação.

**Estado atual:** nenhum GLB foi exportado ainda. A interface usa a prévia 2D rotulada (`apps/web/src/components/Dot2D.tsx`). O arquivo fonte editável (`dot_master.blend`) fica em `blender/out/<build>/` e não é versionado por padrão. Copie para `blender/dot_master.blend` quando o modelo for aprovado.
