// SPDX-License-Identifier: AGPL-3.0-only
/** Utilidades puras e portáveis (Node 22, Workers e navegador). */

/** JSON canônico: chaves ordenadas, sem espaços. Base para hash de payload. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function randomId(prefix = ""): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return prefix + toHex(bytes);
}

/** Comparação em tempo constante para strings de mesmo alfabeto. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Backoff exponencial com jitter; Retry-After é piso quando informado. */
export function backoffMs(attempt: number, opts: { baseMs?: number; maxMs?: number; retryAfterMs?: number | null; random?: () => number } = {}): number {
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 15 * 60_000;
  const rnd = opts.random ?? Math.random;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jittered = exp / 2 + rnd() * (exp / 2);
  return Math.max(opts.retryAfterMs ?? 0, Math.round(jittered));
}

/** Interpreta Retry-After (segundos ou data HTTP). */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return null;
}
