import type { Keyring } from "./crypto.ts";
import type { Db } from "./db/types.ts";
import type { Env } from "./env.ts";

export interface Ctx {
  env: Env;
  db: Db;
  keys: Keyring;
  fetch: typeof fetch;
  now: () => number;
}

/**
 * Limita subrequisições por invocação (Workers Free: 50, conferido em 13/10/2026).
 * Reservamos margem para o banco; ao atingir o teto, o trabalho continua no próximo tique.
 */
export class SubrequestBudget {
  used = 0;
  constructor(readonly max = 40) {}

  wrap(inner: typeof fetch): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (this.used >= this.max) throw new BudgetExhausted();
      this.used++;
      return inner(input, init);
    }) as typeof fetch;
  }

  remaining(): number {
    return this.max - this.used;
  }

  /** Cada query, run ou batch do Turso é uma subrequisição. */
  watch(inner: Db): Db {
    const take = () => {
      if (this.used >= this.max) throw new BudgetExhausted();
      this.used++;
    };
    return {
      query: async (sql, args) => {
        take();
        return inner.query(sql, args);
      },
      run: async (sql, args) => {
        take();
        return inner.run(sql, args);
      },
      batch: async (stmts) => {
        take();
        return inner.batch(stmts);
      },
    };
  }
}

export class BudgetExhausted extends Error {
  constructor() {
    super("limite de subrequisições desta execução atingido");
  }
}
