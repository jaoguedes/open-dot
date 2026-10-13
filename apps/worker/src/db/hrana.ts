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

export class HranaDb implements Db {
  private readonly url: string;

  constructor(
    dbUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const u = dbUrl.replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
    if (!u.startsWith("https://")) throw new HranaError("TURSO_DATABASE_URL precisa ser libsql:// ou https://");
    this.url = `${u}/v2/pipeline`;
  }

  private async pipeline(requests: unknown[]): Promise<Array<{ type: string; response?: { type: string; result?: unknown }; error?: { message: string } }>> {
    const resp = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ requests: [...requests, { type: "close" }] }),
    });
    if (!resp.ok) throw new HranaError(`Turso respondeu ${resp.status}`, resp.status);
    const body = (await resp.json()) as { results: Array<{ type: string; response?: { type: string; result?: unknown }; error?: { message: string } }> };
    return body.results;
  }

  private stmt(s: Stmt) {
    return { sql: s.sql, args: (s.args ?? []).map(toHrana) };
  }

  async query<T = Record<string, SqlValue>>(sql: string, args: SqlValue[] = []): Promise<T[]> {
    const [r] = await this.pipeline([{ type: "execute", stmt: this.stmt({ sql, args }) }]);
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
