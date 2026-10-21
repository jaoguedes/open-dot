// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

test("draft exige os três instaladores e checksums corretos; recusa corrupção e arquivos extras", () => {
  const dir = mkdtempSync(join(tmpdir(), "od-installers-"));
  const verify = () => spawnSync(process.execPath, [resolve("scripts/verify-runner-artifacts.mjs"), dir], { encoding: "utf8" });
  try {
    assert.notEqual(verify().status, 0);
    for (const name of ["OpenDot-Runner-macos-x64.dmg", "OpenDot-Runner-macos-arm64.dmg", "OpenDot-Runner-windows-x64-setup.exe"]) {
      const bytes = Buffer.from(`installer fixture ${name}`);
      writeFileSync(join(dir, name), bytes);
      writeFileSync(join(dir, `${name}.sha256`), `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`);
    }
    assert.equal(verify().status, 0);
    writeFileSync(join(dir, "unintended.txt"), "unexpected");
    assert.notEqual(verify().status, 0);
    rmSync(join(dir, "unintended.txt"));
    writeFileSync(join(dir, "OpenDot-Runner-macos-x64.dmg"), "changed");
    assert.notEqual(verify().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
