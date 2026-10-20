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

test('expert compilation freezes quality context without granting tools or claiming tests',async()=>{
 const {composeExpertPrompt}=await import('../src/expert-contracts.ts');
 const prompt=composeExpertPrompt('Review a fixture safely','application-security');
 assert.ok(prompt.includes('application-security'));assert.ok(prompt.includes('"executionAuthority":false'));
 assert.ok(prompt.includes('"independentReviewRequired":true'));assert.ok(prompt.includes('"reviewStatus":"not-attested"'));
 const context=JSON.parse(prompt.split('\n')[1]!);assert.deepEqual(context.availableTools,[]);assert.deepEqual(context.providedCapabilities,['bounded-source-context','structured-output']);
 assert.throws(()=>composeExpertPrompt('fixture','invented-expert'));
 assert.throws(()=>composeExpertPrompt('x'.repeat(8000),'qa-sdet'));
});
