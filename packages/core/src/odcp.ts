import { z } from "zod";

const hasControl = (s: string) => [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const sha = z
  .string()
  .length(40)
  .regex(/^[a-f0-9]{40}$/);
const path = z
  .string()
  .min(1)
  .max(240)
  .refine((p) => !p.includes("\\") && !p.includes(":") && !hasControl(p) && p.split("/").every((s) => s.length > 0 && !s.startsWith(".")), "Caminho relativo e não oculto obrigatório.");
export const OdcpCheckpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: z.string().uuid(),
    runId: z.string().uuid(),
    projectId: z.string().uuid(),
    revision: z.number().int().min(1),
    state: z.enum(["running", "checkpointed", "paused", "needs_reconciliation", "review", "verified", "failed", "cancelled"]),
    branch: z
      .string()
      .regex(/^(agent|codex)\/[a-zA-Z0-9/_-]+$/)
      .refine((s) => !s.endsWith("/") && !s.includes("//") && !hasControl(s)),
    worktreeId: z.string().uuid(),
    baseSha: sha,
    headSha: sha.nullable(),
    dirtyPaths: z.array(path).max(500),
    snapshotDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    verification: z.enum(["passed", "failed", "not_run"]),
    nextStep: z.string().trim().min(1).max(500),
  })
  .strict();

/** Checklist objetivo; o chamador precisa obter evidência do Git/disco, não de um LLM. */
export function handoffReadiness(input: unknown, observed: { headSha: string | null; snapshotDigest: string | null }): { ready: boolean; missing: string[] } {
  const c = OdcpCheckpointSchema.parse(input),
    missing: string[] = [];
  if (!c.headSha || c.headSha !== observed.headSha) missing.push("verified_git_head");
  if (c.dirtyPaths.length && (!c.snapshotDigest || c.snapshotDigest !== observed.snapshotDigest)) missing.push("verified_dirty_snapshot");
  if (c.verification !== "passed") missing.push("passing_verification");
  if (!["checkpointed", "review", "verified", "paused"].includes(c.state)) missing.push("safe_handoff_state");
  return { ready: missing.length === 0, missing };
}

/** Agendamento puro por tempo ativo; não cria commit, não mede tempo sozinho e não faz push. */
export function checkpointDue(activeMs: number, lastCheckpointActiveMs: number, milestone = false): boolean {
  if (!Number.isSafeInteger(activeMs) || !Number.isSafeInteger(lastCheckpointActiveMs) || lastCheckpointActiveMs < 0 || activeMs < lastCheckpointActiveMs)
    throw new Error("Relógio de trabalho ativo inválido.");
  return milestone || activeMs - lastCheckpointActiveMs >= 25 * 60 * 1000;
}

export function validateCheckpointCommit(subject: string, body: string): string[] {
  const issues: string[] = [];
  if (!/^(feat|fix|refactor|test|docs|perf|chore|ci)(\([a-z0-9-]+\))?!?: .{3,100}$/.test(subject)) issues.push("conventional_commit_required");
  if (!/^Task: [A-Z][A-Z0-9-]{1,31}$/m.test(body)) issues.push("task_trailer_required");
  return issues;
}
