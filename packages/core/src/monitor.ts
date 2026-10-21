// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Monitor HTTP (capítulo 10 e Anexo A): só alvos cadastrados, HTTPS, sem endereços
 * internos, com confirmação antes de alertar e sem afirmar causa.
 */

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
  /^198\.(1[89])\./,
  /^22[4-9]\.|^2[3-5]\d\./, // multicast/reservado
];

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "metadata") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return PRIVATE_V4.some((r) => r.test(h));
  if (/^\d+$/.test(h)) return true; // IP decimal ofuscado
  if (h.includes(":")) {
    // IPv6 literal
    return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
  }
  return false;
}

/** Valida um alvo contra a allowlist do dono. Reaplicada a cada redirecionamento. */
export function checkTarget(rawUrl: string, allowedHosts: readonly string[]): UrlCheck {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "apenas HTTPS" };
  if (u.username || u.password) return { ok: false, reason: "credenciais na URL não são permitidas" };
  if (u.port && u.port !== "443") return { ok: false, reason: "porta não permitida" };
  if (isPrivateHost(u.hostname)) return { ok: false, reason: "endereço interno bloqueado" };
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) return { ok: false, reason: "host fora da sua lista" };
  return { ok: true };
}

export interface Sample {
  at: number;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error?: string;
}

export interface IncidentState {
  open: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  openedAt: number | null;
  lastChangeAt: number | null;
}

export const initialIncident: IncidentState = { open: false, consecutiveFailures: 0, consecutiveSuccesses: 0, openedAt: null, lastChangeAt: null };

export interface IncidentPolicy {
  openAfterFailures: number;
  closeAfterSuccesses: number;
  slowMs: number;
}

export const DEFAULT_INCIDENT_POLICY: IncidentPolicy = { openAfterFailures: 3, closeAfterSuccesses: 2, slowMs: 1500 };

/** Atalho do Sentinela: o próprio Open Dot, só leitura do health. Vem do APP_ORIGIN; origem local não vale. */
export function selfHealthUrl(appOrigin: string): string | null {
  try {
    const u = new URL(appOrigin);
    if (u.protocol !== "https:") return null;
    return `${u.origin}/api/health`;
  } catch {
    return null;
  }
}

export type IncidentTransition = "opened" | "closed" | null;

export function applySample(s: IncidentState, sample: Sample, policy = DEFAULT_INCIDENT_POLICY): { state: IncidentState; transition: IncidentTransition } {
  if (!sample.ok) {
    const failures = s.consecutiveFailures + 1;
    if (!s.open && failures >= policy.openAfterFailures) {
      return { state: { open: true, consecutiveFailures: failures, consecutiveSuccesses: 0, openedAt: sample.at, lastChangeAt: sample.at }, transition: "opened" };
    }
    return { state: { ...s, consecutiveFailures: failures, consecutiveSuccesses: 0 }, transition: null };
  }
  const successes = s.consecutiveSuccesses + 1;
  if (s.open && successes >= policy.closeAfterSuccesses) {
    return { state: { open: false, consecutiveFailures: 0, consecutiveSuccesses: successes, openedAt: null, lastChangeAt: sample.at }, transition: "closed" };
  }
  return { state: { ...s, consecutiveFailures: 0, consecutiveSuccesses: successes }, transition: null };
}

/**
 * Texto honesto sobre proximidade entre deploy e incidente.
 * Proximidade temporal é sinal, não causa.
 */
export function correlateDeploy(incidentAt: number, deploys: Array<{ id: string; createdAt: number; sha: string | null }>, windowMs = 30 * 60_000): string | null {
  const near = deploys.filter((d) => Math.abs(d.createdAt - incidentAt) <= windowMs).sort((a, b) => Math.abs(a.createdAt - incidentAt) - Math.abs(b.createdAt - incidentAt))[0];
  if (!near) return null;
  const mins = Math.round(Math.abs(near.createdAt - incidentAt) / 60_000);
  const when = near.createdAt <= incidentAt ? `${mins} min antes` : `${mins} min depois`;
  return `Houve um deploy ${when} (${near.sha ? near.sha.slice(0, 7) : near.id}). Ainda não há evidência de que seja a causa.`;
}
