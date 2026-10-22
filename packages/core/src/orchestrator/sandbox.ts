// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Execução de testes em cópia isolada (v0.3, 4.5) — CONTRATO. Chave `ORCH_SANDBOX_TESTS`,
 * desligada. Estado: BLOQUEADO. Não há, sem custo, uma forma comprovada de impedir rede e escrita
 * fora da cópia no macOS e no Windows (o `sandbox-exec` do macOS é obsoleto e não foi testado como
 * garantia; o Windows não tem equivalente gratuito testado). Por isso a única implementação é a
 * "indisponível". O contrato abaixo fixa o que uma implementação futura precisa respeitar.
 */
export interface SandboxRequest {
  projectId: string;
  /** argv exato (sem shell). Precisa ser idêntico a uma entrada da allowlist do Passport. */
  argv: string[];
  timeoutMs: number;
  outputCapBytes: number;
}
export interface SandboxPolicy {
  /** Comandos declarados no Passport do projeto, ex.: [["npm","test"]]. */
  allowlist: string[][];
  enabled: boolean;
}
export const SANDBOX_LIMITS = { timeoutMs: 600_000, outputCapBytes: 1_000_000 } as const;
const SHELLISH = /[;&|`$<>(){}*?!~\\\n\r"']/;

export function sandboxFlag(env: Record<string, string | undefined>): boolean {
  return env.ORCH_SANDBOX_TESTS === "1";
}

/** Validação do pedido: só argv da allowlist, sem metacaracteres, limites dentro do teto. */
export function validateSandbox(req: SandboxRequest, policy: SandboxPolicy): string | null {
  if (!policy.enabled) return "Execução de testes isolada desligada (ORCH_SANDBOX_TESTS).";
  if (!req.argv.length || req.argv.length > 8) return "Comando vazio ou longo demais.";
  if (req.argv.some((a) => !a || a.length > 120 || SHELLISH.test(a))) return "Argumento com caractere de shell: recusado.";
  if (!policy.allowlist.some((c) => c.length === req.argv.length && c.every((x, i) => x === req.argv[i]))) return "Comando fora da lista declarada no Passport do projeto.";
  if (!(req.timeoutMs > 0 && req.timeoutMs <= SANDBOX_LIMITS.timeoutMs)) return "Tempo máximo fora do limite.";
  if (!(req.outputCapBytes > 0 && req.outputCapBytes <= SANDBOX_LIMITS.outputCapBytes)) return "Limite de saída fora do teto.";
  return null;
}

/** O que a aprovação cobre: o comando exato, o projeto e os limites. */
export async function sandboxApprovalHash(req: SandboxRequest): Promise<string> {
  const text = JSON.stringify([req.projectId, req.argv, req.timeoutMs, req.outputCapBytes]);
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SandboxOutcome {
  exitCode: number;
  output: string;
  truncated: boolean;
}
export interface SandboxRunner {
  readonly available: boolean;
  readonly reason: string;
  run(req: SandboxRequest, approvalHash: string): Promise<SandboxOutcome>;
}

/** Única implementação nesta versão: recusa sempre, com o motivo. */
export const UNAVAILABLE_SANDBOX: SandboxRunner = {
  available: false,
  reason: "Bloqueado: contenção de rede e de escrita fora da cópia não comprovada no macOS nem no Windows com o que existe sem custo.",
  async run() {
    throw new Error(this.reason);
  },
};
