// SPDX-License-Identifier: AGPL-3.0-only
import { DatabaseSync } from "node:sqlite";
import type { Db, RunResult, SqlValue, Stmt } from "./types.ts";

/** SQLite local (Node 22.13+), para desenvolvimento e testes. Não é usado no Worker. */
export class SqliteDb implements Db {
  readonly raw: DatabaseSync;

  constructor(path = ":memory:") {
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  }

  async query<T = Record<string, SqlValue>>(sql: string, args: SqlValue[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...args) as T[];
  }

  async run(sql: string, args: SqlValue[] = []): Promise<RunResult> {
    const r = this.raw.prepare(sql).run(...args);
    return { changes: Number(r.changes) };
  }

  async batch(stmts: Stmt[]): Promise<RunResult[]> {
    this.raw.exec("BEGIN");
    try {
      const out = stmts.map((s) => ({ changes: Number(this.raw.prepare(s.sql).run(...(s.args ?? [])).changes) }));
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }
}
