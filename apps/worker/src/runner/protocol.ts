import { z } from "zod";
export const RUNNER_PROTOCOL = 2;
export const APPROVAL_CONTRACT = "sha256-utf8-json-v1";
export const REQUIRED_CAPABILITIES = ["exact-content-approval", "uncertain-terminal", "lease-fencing", "event-receipts", "worktree-consent", "review-before-content"] as const;
export const runnerHello = z.object({ version:z.number().int(), approval:z.string().max(80), capabilities:z.array(z.string().max(80)).max(20) }).strict();
export function runnerCompatible(value: unknown): boolean {
 const p=runnerHello.safeParse(value);
 return p.success && p.data.version===RUNNER_PROTOCOL && p.data.approval===APPROVAL_CONTRACT && REQUIRED_CAPABILITIES.every(c=>p.data.capabilities.includes(c));
}
