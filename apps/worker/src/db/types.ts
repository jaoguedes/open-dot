export type SqlValue = string | number | null;

export interface Stmt {
  sql: string;
  args?: SqlValue[];
}

export interface RunResult {
  changes: number;
}

/**
 * Interface mínima de banco. Mesmo contrato para SQLite local (desenvolvimento/testes)
 * e Turso remoto (HTTP). Consultas sempre parametrizadas.
 */
export interface Db {
  query<T = Record<string, SqlValue>>(sql: string, args?: SqlValue[]): Promise<T[]>;
  run(sql: string, args?: SqlValue[]): Promise<RunResult>;
  /** Executa em uma única transação: tudo ou nada. */
  batch(stmts: Stmt[]): Promise<RunResult[]>;
}
