// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORREIO_THRESHOLDS } from "../packages/core/src/correio-eval.ts";

test("eval:correio roda no check e na CI, com 90% / 95%", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts.check!, /eval:correio/);
  assert.match(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"), /npm run eval:correio/);
  assert.equal(CORREIO_THRESHOLDS.needYouPrecision, 0.9);
  assert.equal(CORREIO_THRESHOLDS.securityPaymentRecall, 0.95);
});

test("o script avisa que não é medida real", () => {
  const src = readFileSync(new URL("../scripts/eval-correio.ts", import.meta.url), "utf8");
  assert.match(src, /NÃO uma medida de qualidade/);
  assert.match(readFileSync(new URL("../packages/core/test/fixtures/correio-holdout/README.md", import.meta.url), "utf8"), /revisor que não leu as regras/);
});
