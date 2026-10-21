# Fazer um fork do Open Dot

O código é AGPL-3.0 (`LICENSE`). O **Dot** (mascote, arte, sons, ícones e o código que o desenha) tem licença própria, todos os direitos reservados (`LICENSE-DOT-ASSETS.md`), e o nome “Open Dot” segue `TRADEMARK.md`. Um fork público precisa de outro nome e não pode distribuir o Dot.

## 1. Trocar o Dot pelo Marcador

O app só conhece o mascote pela fronteira `@open-dot/mascot`:

- com o Dot: `tsconfig.json` → `apps/web/src/mascot/dot.ts`;
- sem o Dot: `tsconfig.placeholder.json` → `apps/web/src/mascot/placeholder/` (Marcador, AGPL-3.0).

```bash
npm run check:without-dot                  # prova: typecheck, testes e builds sem nenhum arquivo do Dot
OPEN_DOT_MASCOT=placeholder npm run build  # build do app com o Marcador
```

## 2. Remover os arquivos do Dot do seu fork

A lista oficial está em `scripts/lib/dot-paths.mjs` (`DOT_PATHS`). Remova esses caminhos, copie os ícones do Marcador para os lugares do app e aponte o `tsconfig.json` para o Marcador:

```bash
node -e 'import("./scripts/lib/dot-paths.mjs").then(m=>console.log(m.DOT_PATHS.join("\n")))'
cp assets/placeholder/icons/*.png apps/web/public/icons/
cp assets/placeholder/icons/favicon.ico apps/web/public/favicon.ico
cp tsconfig.placeholder.json tsconfig.json   # depois ajuste "extends" se necessário
```

O script `scripts/check-without-dot.mjs` faz exatamente isso numa cópia temporária; leia-o como referência.

## 3. Nome, instância e segredos

- Escolha outro nome e troque textos visíveis (“Open Dot”) no seu fork.
- Configure a **sua** instância: `docs/SETUP.md`. O `wrangler.jsonc` só tem placeholders; nada aponta para a instância do mantenedor.
- Segredos nunca entram no Git: `.dev.vars` local e `wrangler secret put` na nuvem.

## 4. Obrigações da AGPL

Se você hospedar o fork para outras pessoas, ofereça o código-fonte correspondente a quem usa pela rede (seção 13). Para usar o código sem essas obrigações, veja `COMMERCIAL-LICENSE.md`.
