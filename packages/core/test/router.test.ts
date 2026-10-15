import { test } from "node:test";
import assert from "node:assert/strict";
import { AiRouter, type AiTask } from "../src/ai/router.ts";
import { MemoryLedger } from "../src/ai/budget.ts";
import { DEFAULT_OWNER_LIMITS, defaultProviders, validateProviders, type ProviderConfig } from "../src/ai/config.ts";

const okBody = (text = "{}") => new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 50, completion_tokens: 10 } }), { status: 200 });

function provider(id: string, allowedData: ProviderConfig["allowedData"], extra: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id,
    label: id,
    baseUrl: `https://${id}.example/v1`,
    apiKeyEnv: `${id.toUpperCase()}_KEY`,
    billing: "free_tier",
    allowedData,
    privacyConfirmed: true,
    privacyNote: "",
    models: [{ id: `${id}-m`, capabilities: ["classify", "summarize", "answer", "json"], contextTokens: 8000, maxOutputTokens: 200, limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000 } }],
    ...extra,
  };
}

const task = (p: Partial<AiTask> = {}): AiTask => ({
  ownerId: "o1",
  kind: "email_triage",
  capability: "classify",
  dataClass: "private_email",
  messages: [{ role: "user", content: "x".repeat(200) }],
  maxOutputTokens: 100,
  ...p,
});

const ledger = (calls = 50, tokens = 100_000) => new MemoryLedger(() => ({ ownerCallsPerDay: calls, ownerTokensPerDay: tokens, modelRequestsPerDay: 1000, modelTokensPerDay: 200_000 }));

test("validação recusa provedor pago e dado privado sem confirmação de política", () => {
  const { ok, rejected } = validateProviders([{ ...provider("a", ["public"]), billing: "paid" }, { ...provider("b", ["private_email"]), privacyConfirmed: false }, provider("c", ["public"])]);
  assert.deepEqual(
    ok.map((p) => p.id),
    ["c"],
  );
  assert.equal(rejected.length, 2);
});

test("sem ZDR confirmado, e-mail privado não vai para o Groq", () => {
  const groq = defaultProviders({ GROQ_API_KEY: "k" });
  const r = new AiRouter({ providers: groq, ledger: ledger(), limits: DEFAULT_OWNER_LIMITS, env: { GROQ_API_KEY: "k" }, fetch: async () => okBody() });
  assert.equal(r.candidates({ dataClass: "private_email", capability: "classify" }).length, 0);
  assert.ok(r.candidates({ dataClass: "public", capability: "classify" }).length > 0);
});

test("429 em A e B não permitido para conteúdo privado: aguarda, não envia a B", async () => {
  const calls: string[] = [];
  const A = provider("a", ["public", "private_email"]);
  const B = provider("b", ["public"]); // B não pode receber e-mail privado
  const r = new AiRouter({
    providers: [A, B],
    ledger: ledger(),
    limits: DEFAULT_OWNER_LIMITS,
    env: { A_KEY: "1", B_KEY: "2" },
    now: () => 1_000_000,
    fetch: async (url) => {
      calls.push(String(url));
      return new Response("", { status: 429, headers: { "retry-after": "20" } });
    },
  });
  const out = await r.run(task());
  assert.equal(out.status, "waiting_quota");
  if (out.status === "waiting_quota") assert.equal(out.retryAt, 1_000_000 + 20_000);
  assert.ok(
    calls.every((u) => u.includes("a.example")),
    "nenhuma chamada a B",
  );
});

test("reservas concorrentes no último saldo não ultrapassam o teto", async () => {
  const l = ledger(3, 100_000);
  const results = await Promise.all(Array.from({ length: 10 }, () => l.reserve({ ownerId: "o1", providerId: "p", modelId: "m", day: "2026-10-13", tokens: 10 })));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal(l.usage("owner:o1:2026-10-13").calls, 3);
});

test("limite de concorrência por dono: segunda chamada simultânea aguarda", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const r = new AiRouter({
    providers: [provider("a", ["private_email"])],
    ledger: ledger(),
    limits: { ...DEFAULT_OWNER_LIMITS, maxConcurrent: 1 },
    env: { A_KEY: "1" },
    fetch: async () => {
      await gate;
      return okBody();
    },
  });
  const first = r.run(task());
  const second = await r.run(task());
  assert.equal(second.status, "waiting_quota");
  release();
  assert.equal((await first).status, "ok");
});

test("timeout conta como falha; três falhas abrem o circuit breaker", async () => {
  let n = 0;
  const r = new AiRouter({
    providers: [provider("a", ["public"])],
    ledger: ledger(),
    limits: { ...DEFAULT_OWNER_LIMITS, timeoutMs: 20, maxAttemptsPerStep: 1 },
    env: { A_KEY: "1" },
    fetch: (_u, init) =>
      new Promise((_res, rej) => {
        n++;
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      }),
  });
  for (let i = 0; i < 3; i++) assert.equal((await r.run(task({ dataClass: "public" }))).status, "unavailable");
  assert.equal(n, 3);
  const out = await r.run(task({ dataClass: "public" }));
  assert.equal(out.status, "unavailable");
  assert.equal(n, 3, "breaker aberto: não chama de novo");
});

test("cancelamento do usuário interrompe a chamada", async () => {
  const ctrl = new AbortController();
  const r = new AiRouter({
    providers: [provider("a", ["public"])],
    ledger: ledger(),
    limits: DEFAULT_OWNER_LIMITS,
    env: { A_KEY: "1" },
    fetch: (_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("x")))),
  });
  const p = r.run(task({ dataClass: "public", signal: ctrl.signal }));
  ctrl.abort();
  assert.equal((await p).status, "cancelled");
});

test("401 desativa o provedor e o registro de consumo não contém conteúdo", async () => {
  const usage: unknown[] = [];
  const r = new AiRouter({
    providers: [provider("a", ["public"])],
    ledger: ledger(),
    limits: DEFAULT_OWNER_LIMITS,
    env: { A_KEY: "1" },
    fetch: async () => new Response("", { status: 401 }),
    onUsage: (u) => void usage.push(u),
  });
  const secretText = "conteúdo privado do e-mail 123";
  await r.run(task({ dataClass: "public", messages: [{ role: "user", content: secretText }] }));
  assert.equal(r.breakerState("a")?.disabled, true);
  assert.ok(!JSON.stringify(usage).includes(secretText));
});

test("segredo nunca é roteado para IA", () => {
  const r = new AiRouter({ providers: [provider("a", ["public", "personal", "private_email"])], ledger: ledger(), limits: DEFAULT_OWNER_LIMITS, env: { A_KEY: "1" }, fetch: async () => okBody() });
  assert.equal(r.candidates({ dataClass: "secret", capability: "answer" }).length, 0);
});

test("Groq usa max_completion_tokens e reasoning low; 402 desliga a rota", async () => {
  const bodies: string[] = [];
  const groq = provider("groq", ["public", "personal"]);
  groq.apiKeyEnv = "GROQ_API_KEY";
  const r = new AiRouter({
    providers: [groq],
    ledger: ledger(),
    limits: DEFAULT_OWNER_LIMITS,
    env: { GROQ_API_KEY: "k" },
    fetch: async (_url, init) => {
      bodies.push(String(init?.body ?? ""));
      return new Response("", { status: 402 });
    },
  });
  const out = await r.run(task({ dataClass: "public" }));
  assert.equal(out.status, "unavailable");
  const payload = JSON.parse(bodies[0]!);
  assert.equal(payload.max_completion_tokens, 100);
  assert.equal(payload.reasoning_effort, "low");
  assert.equal(payload.max_tokens, undefined);
  const again = await r.run(task({ dataClass: "public" }));
  assert.equal(again.status, "unavailable");
  assert.equal(bodies.length, 1, "402 não tenta de novo na mesma instância");
});

test("registro D-016: só Groq ligado; Gemini nunca privado; nenhuma rota paga", async () => {
  const { PROVIDER_REGISTRY, enabledProviders, registryAllowsPaid } = await import("../src/ai/registry.ts");
  assert.equal(registryAllowsPaid(), false);
  assert.deepEqual(
    enabledProviders().map((p) => p.id),
    ["groq"],
  );
  const gemini = PROVIDER_REGISTRY.find((p) => p.id === "gemini")!;
  assert.equal(gemini.enabled, false);
  assert.equal(gemini.neverPrivate, true);
  assert.ok(!gemini.allowedData.includes("private_email"));
  assert.ok(PROVIDER_REGISTRY.every((p) => p.billing !== "paid" || !p.enabled));
});
