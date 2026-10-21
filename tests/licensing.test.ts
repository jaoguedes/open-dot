// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DOT_PATHS } from "../scripts/lib/dot-paths.mjs";
import { codeFiles, expectedLicense, withHeader } from "../scripts/license/spdx.mjs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("LICENSE é o texto oficial da AGPL-3.0 (gnu.org, 661 linhas)", () => {
  const text = read("LICENSE");
  assert.equal(createHash("sha256").update(text).digest("hex"), "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0");
  assert.equal(JSON.parse(read("package.json")).license, "AGPL-3.0-only");
  assert.match(read("apps/runner/src-tauri/Cargo.toml"), /^license = "AGPL-3.0-only"$/m);
});

test("cada pasta do Dot tem aviso de todos os direitos reservados", { skip: !existsSync(new URL("../apps/web/src/dot/", import.meta.url)) && "build sem o Dot" }, () => {
  for (const p of DOT_PATHS.filter((p) => p.endsWith("/") && !p.endsWith("/test/"))) {
    const file = `${p}LICENSE`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
    assert.match(read(file), /LicenseRef-OpenDot-Mascot-All-Rights-Reserved/);
  }
});

test("todo arquivo de código tem o SPDX da sua licença", () => {
  const wrong = codeFiles().filter((f) => withHeader(f, read(f)) !== read(f));
  assert.deepEqual(wrong, []);
  assert.equal(expectedLicense("apps/web/src/dot/DotView.tsx"), "LicenseRef-OpenDot-Mascot-All-Rights-Reserved");
  assert.equal(expectedLicense("apps/web/src/mascot/placeholder/index.tsx"), "AGPL-3.0-only");
});

test("migrações aplicadas não recebem cabeçalho (checksum conferido em produção)", () => {
  assert.ok(!codeFiles().some((f) => f.startsWith("apps/worker/migrations/")));
});
