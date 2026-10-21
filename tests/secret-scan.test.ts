// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "../scripts/lib/secret-scan.mjs";

const fake = (prefix: string, n: number) => prefix + "A1b2C3d4E5".repeat(10).slice(0, n);

test("acha chaves conhecidas e atribuições com valor", () => {
  const text = [`const k = "${fake("gsk_", 48)}";`, `token: ${fake("ghp_", 36)}`, `GROQ_API_KEY=${fake("", 40)}`, `TURSO_AUTH_TOKEN: "${fake("", 30)}"`, "-----BEGIN PRIVATE KEY-----"].join("\n");
  const rules = scanText("x.ts", text).map((h) => h.rule);
  assert.deepEqual(rules, ["groq-key", "github-token", "secret-assignment", "secret-assignment", "private-key"]);
});

test("não acusa nomes de variável, exemplos vazios nem leitura de env", () => {
  const text = [
    "GROQ_API_KEY=",
    "TURSO_AUTH_TOKEN: z.string().optional(),",
    "const t = env.TURSO_AUTH_TOKEN;",
    'GOOGLE_CLIENT_SECRET="<cole aqui>"',
    "TOKEN_KEYS=$(npm run secrets:keygen)",
    "    GOOGLE_CLIENT_SECRET: googleSecret,",
    `  GROQ_API_KEY: "gsk_super_secreta_de_teste" // scan-secrets: teste`,
  ].join("\n");
  assert.deepEqual(scanText("x.ts", text), []);
});
