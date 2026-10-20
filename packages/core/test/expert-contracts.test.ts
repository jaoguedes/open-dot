import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPERT_CONTRACTS, ExpertContractSchema, eligibleExpertTools } from "../src/expert-contracts.ts";
test("dez especialistas versionados não inventam capacidade nem elevam permissão", () => {
  assert.equal(EXPERT_CONTRACTS.length, 10);
  assert.equal(new Set(EXPERT_CONTRACTS.map((p) => p.id)).size, 10);
  for (const p of EXPERT_CONTRACTS) {
    assert.deepEqual(eligibleExpertTools(p, [], p.allowed_tools), []);
    assert.deepEqual(eligibleExpertTools(p, p.allowed_tools, []), []);
    assert.deepEqual(eligibleExpertTools(p, ["git_diff"], ["git_diff"]), ["git_diff"]);
    assert.ok(!ExpertContractSchema.safeParse({ ...p, allowed_tools: ["unrestricted_shell"] }).success);
    assert.ok(!ExpertContractSchema.safeParse({ ...p, model: "unverified-model" }).success);
  }
  const security = EXPERT_CONTRACTS.find((p) => p.id === "application-security")!;
  assert.ok(!ExpertContractSchema.safeParse({ ...security, review_policy: { ...security.review_policy, require_independent_review_for_critical: false } }).success);
  assert.ok(!ExpertContractSchema.safeParse({ ...security, disallowed_tools: Array(4).fill("credential_read") }).success);
});
