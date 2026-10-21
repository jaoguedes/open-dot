// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { scanPii, localTerms } from "../scripts/lib/pii-scan.mjs";

const at = (local: string, domain: string) => `${local}@${domain}`;
const rules = (text: string, terms: string[] = []) => scanPii("x.md", text, terms).map((h) => h.rule);

test("acha e-mail em domínio real, caminho de máquina, subdomínio, host de banco e IDs de deploy", () => {
  assert.deepEqual(rules(`to: "${at("pessoa", "gmail.com")}"`), ["email-real-domain"]);
  assert.deepEqual(rules("arquivo em /Users/fulano/projeto"), ["machine-path"]);
  assert.deepEqual(rules("https://open-dot.minhaconta.workers.dev/api/health"), ["workers-subdomain"]);
  assert.deepEqual(rules("libsql://open-dot-minhaconta.aws-us-east-1.turso.io"), ["database-host"]);
  assert.deepEqual(rules("Worker no ar `4d1dbc6e-b55d-475f-8e27-ec36659eb036`"), ["deploy-id"]);
});

test("acha CPF e CNPJ só quando o dígito confere, e telefone com contexto", () => {
  assert.deepEqual(rules("CPF 529.982.247-25"), ["cpf"]);
  assert.deepEqual(rules("CPF 111.222.333-44"), []);
  assert.deepEqual(rules("CNPJ 11.222.333/0001-81"), ["cnpj"]);
  assert.deepEqual(rules("WhatsApp +55 (11) 91234-5678"), ["phone-br"]);
  assert.deepEqual(rules("pedido 11 91234-5678 sem contexto"), []);
});

test("não acusa domínios reservados, placeholders e marcação fictícia", () => {
  const ok = [
    `from: ${at("ana", "example.com")}, ${at("b", "loja.example")}, ${at("x", "exemplo.test")}, ${at("dev", "localhost")}`,
    `${at("123", "users.noreply.github.com")} e ${at("noreply", "anthropic.com")}`,
    "https://open-dot.<SEU-SUBDOMINIO>.workers.dev e https://open-dot.example.workers.dev",
    "libsql://open-dot-<org>.turso.io e libsql://... e db.turso.io",
    "/Users/runner/work e /home/user/x",
    `${at("pessoa", "gmail.com")} // pii-scan: fictício`,
  ].join("\n");
  assert.deepEqual(rules(ok), []);
});

test("termos locais do mantenedor ficam fora do repositório e são procurados sem distinguir caixa", () => {
  assert.deepEqual(rules("conta MeuHandle123 no texto", ["meuhandle123"]), ["local-term"]);
  assert.deepEqual(localTerms("/caminho/que/nao/existe", { OPEN_DOT_PII_TERMS: "abcd, xy ,efghij" }), ["abcd", "efghij"]);
});

test("contato público: aceito só nos cinco arquivos autorizados e recusado em qualquer outro", async () => {
  const { readFileSync } = await import("node:fs");
  const security = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");
  const contact = /[A-Za-z0-9._%+-]+@gmail\.com/.exec(security)?.[0];
  assert.ok(contact, "SECURITY.md tem o contato público");
  const line = `Contato: ${contact}`;
  for (const ok of ["SECURITY.md", "COMMERCIAL-LICENSE.md", "LICENSE-DOT-ASSETS.md", "TRADEMARK.md", "CODE_OF_CONDUCT.md"]) assert.deepEqual(scanPii(ok, line, ["jpguedesbarbieri"]), [], ok);
  for (const bad of ["README.md", "docs/SETUP.md", "apps/web/src/App.tsx", "security.md", "docs/SECURITY.md", "SECURITY.md.bak"]) {
    const rules = scanPii(bad, line, ["jpguedesbarbieri"]).map((h) => h.rule);
    assert.ok(rules.includes("email-real-domain"), bad);
  }
  assert.ok(scanPii("SECURITY.md", `${contact} e outra.pessoa@gmail.com`).some((h) => h.rule === "email-real-domain"), "outro e-mail na mesma linha continua recusado");
  const allow = JSON.parse(readFileSync(new URL("../scripts/lib/pii-allowlist.json", import.meta.url), "utf8"));
  assert.equal(allow.entradas.length, 1);
  assert.ok(!JSON.stringify(allow).includes("@"), "a lista guarda só o hash, não o endereço");
});
