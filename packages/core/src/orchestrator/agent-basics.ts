// SPDX-License-Identifier: AGPL-3.0-only
/** Partes do formato de agente que não dependem de validação (seguras no bundle do navegador). */
export const AGENT_LIMITS = { agentMd: 48_000, rubrica: 16_000, schema: 8_000, evals: 24_000, evalCount: 12 } as const;

export interface AgentFiles {
  agentMd: string;
  rubrica: string;
  schema: string;
  evals: string[];
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash estável do pacote inteiro; o lock fixa cada agente por este valor. */
export function packageHash(files: AgentFiles): Promise<string> {
  return sha256(JSON.stringify([files.agentMd, files.rubrica, files.schema, files.evals]));
}

/**
 * Prévia SÓ PARA EXIBIR o que o pacote declara (sem validar). A validação de verdade é do carregador,
 * no servidor; o navegador nunca decide se um pacote é aceito.
 */
export function declaredMeta(agentMd: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(agentMd);
  const out: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split("\n").slice(0, 40)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]!] = kv[2]!.slice(0, 300);
  }
  return out;
}
