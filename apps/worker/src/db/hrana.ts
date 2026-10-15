import type { Db, RunResult, SqlValue, Stmt } from "./types.ts";

/**
 * Cliente Turso via HTTP (Hrana /v2/pipeline), sem dependência externa.
 * Formato conferido em docs.turso.tech/sdk/http/reference (13/10/2026).
 * O token do banco só existe no Worker; nunca chega ao navegador.
 */

type HranaValue =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };

interface ExecuteResult {
  cols: Array<{ name: string }>;
  rows: HranaValue[][];
  affected_row_count: number;
}

function toHrana(v: SqlValue): HranaValue {
  if (v === null) return { type: "null" };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: v };
}

function fromHrana(v: HranaValue): SqlValue {
  switch (v.type) {
    case "null":
      return null;
    case "integer": {
      const n = Number(v.value);
      // IDs grandes continuam texto para não perder precisão.
      return Number.isSafeInteger(n) ? n : v.value;
    }
    case "float":
      return v.value;
    case "text":
      return v.value;
    case "blob":
      return v.base64;
  }
}

export class HranaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const TIMEOUT_MS = 8_000;
/** Teto de novas tentativas por instância (uma por requisição ou tique): 44 + 3 < 50. */
const MAX_RETRIES = 3;

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryWaitMs(resp: Response | null): number {
  const raw = resp?.headers.get("retry-after");
  const sec = raw ? Number(raw) : NaN;
  if (Number.isFinite(sec) && sec >= 0) return Math.min(2_000, sec * 1000);
  return 300;
}

export class HranaDb implements Db {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private retriesLeft = MAX_RETRIES;

  constructor(
    dbUrl: string,
    private readonly token: string,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    opts: { sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const u = dbUrl.replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
    if (!u.startsWith("https://")) throw new HranaError("TURSO_DATABASE_URL precisa ser libsql:// ou https://");
    this.url = `${u}/v2/pipeline`;
    // workerd lança Illegal invocation se o fetch global for chamado como método (this.fetchImpl()).
    this.fetchImpl = (input, init) => fetchImpl(input, init);
  }

  /**
   * Um pedido ao Turso com timeout de 8 s. Leituras (`read`) têm UMA nova tentativa em
   * 5xx, 429 ou falha de rede, respeitando Retry-After. Escritas nunca repetem sozinhas.
   */
  private async pipeline(requests: unknown[], read = false): Promise<Array<{ type: string; response?: { type: string; result?: unknown }; error?: { message: string } }>> {
    const attempt = async () =>
      this.fetchImpl(this.url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify({ requests: [...requests, { type: "close" }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let resp: Response | null = null;
    let failure: unknown = null;
    try {
      resp = await attempt();
    } catch (e) {
      failure = e;
    }
    const failed = failure !== null || (resp !== null && retryable(resp.status));
    if (failed && read && this.retriesLeft > 0) {
      this.retriesLeft--;
      await this.sleep(retryWaitMs(resp));
      failure = null;
      try {
        resp = await attempt();
      } catch (e) {
        failure = e;
      }
    }
    if (failure !== null || !resp) {
      const timedOut = failure instanceof Error && (failure.name === "TimeoutError" || failure.name === "AbortError");
      throw new HranaError(timedOut ? "Turso: tempo esgotado" : "Turso: falha de rede");
    }
    if (!resp.ok) throw new HranaError(`Turso respondeu ${resp.status}`, resp.status);
    const body = (await resp.json()) as { results: Array<{ type: string; response?: { type: string; result?: unknown }; error?: { message: string } }> };
    return body.results;
  }

  private stmt(s: Stmt) {
    return { sql: s.sql, args: (s.args ?? []).map(toHrana) };
  }

  async query<T = Record<string, SqlValue>>(sql: string, args: SqlValue[] = []): Promise<T[]> {
    const [r] = await this.pipeline([{ type: "execute", stmt: this.stmt({ sql, args }) }], /^\s*(select|with|pragma)\b/i.test(sql));
    if (!r || r.type !== "ok") throw new HranaError(r?.error?.message ?? "falha na consulta");
    const res = r.response?.result as ExecuteResult;
    return res.rows.map((row) => Object.fromEntries(res.cols.map((c, i) => [c.name, fromHrana(row[i]!)])) as T);
  }

  async run(sql: string, args: SqlValue[] = []): Promise<RunResult> {
    const [r] = await this.pipeline([{ type: "execute", stmt: this.stmt({ sql, args }) }]);
    if (!r || r.type !== "ok") throw new HranaError(r?.error?.message ?? "falha na escrita");
    return { changes: (r.response?.result as ExecuteResult).affected_row_count };
  }

  /** Transação via batch condicional: BEGIN → passos → COMMIT, ROLLBACK se algo falhar. */
  async batch(stmts: Stmt[]): Promise<RunResult[]> {
    const steps: unknown[] = [{ stmt: { sql: "BEGIN" } }];
    stmts.forEach((s, i) => steps.push({ stmt: this.stmt(s), condition: { type: "ok", step: i } }));
    const commitStep = stmts.length + 1;
    steps.push({ stmt: { sql: "COMMIT" }, condition: { type: "ok", step: stmts.length } });
    steps.push({ stmt: { sql: "ROLLBACK" }, condition: { type: "not", cond: { type: "ok", step: commitStep } } });
    const [r] = await this.pipeline([{ type: "batch", batch: { steps } }]);
    if (!r || r.type !== "ok") throw new HranaError(r?.error?.message ?? "falha na transação");
    const result = r.response?.result as { step_results: Array<ExecuteResult | null>; step_errors: Array<{ message: string } | null> };
    const err = result.step_errors.find((e) => e);
    if (!result.step_results[commitStep] || err) throw new HranaError(err?.message ?? "transação revertida");
    return stmts.map((_, i) => ({ changes: result.step_results[i + 1]?.affected_row_count ?? 0 }));
  }
}
