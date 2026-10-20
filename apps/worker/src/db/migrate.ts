import { sha256Hex } from "@open-dot/core";
import type { Db, Stmt } from "./types.ts";

export interface Migration {
  version: string; // "0001"
  name: string;
  sql: string;
}

/** Versão de schema que este código exige. Atualize ao criar nova migração. */
export const REQUIRED_SCHEMA = "0014";

/** Schema mais novo que o código continua ok (expandir, publicar, contrair depois). */
export function schemaCompatible(version: string | null | undefined, required: string): boolean {
  return typeof version === "string" && version >= required;
}

const META = `CREATE TABLE IF NOT EXISTS od_schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

/**
 * Divide SQL em comandos. Remove comentários "--" (inclusive no fim da linha),
 * respeitando strings entre aspas simples. Migrações não usam triggers.
 */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (!inStr && ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      cur += "\n";
      continue;
    }
    if (ch === "'") inStr = !inStr;
    if (!inStr && ch === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const DESTRUCTIVE = /\b(DROP\s+TABLE|DROP\s+INDEX|DELETE\s+FROM|ALTER\s+TABLE\s+\w+\s+DROP|TRUNCATE)\b/i;

export async function applyMigrations(db: Db, migrations: Migration[], opts: { allowDestructive?: boolean } = {}): Promise<{ applied: string[]; skipped: string[] }> {
  await db.run(META);
  const done = new Map((await db.query<{ version: string; checksum: string }>("SELECT version, checksum FROM od_schema_migrations")).map((r) => [r.version, r.checksum]));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const m of [...migrations].sort((a, b) => a.version.localeCompare(b.version))) {
    const checksum = await sha256Hex(m.sql);
    const prev = done.get(m.version);
    if (prev) {
      if (prev !== checksum) throw new Error(`Migração ${m.version} foi alterada depois de aplicada. Crie uma nova migração.`);
      skipped.push(m.version);
      continue;
    }
    if (DESTRUCTIVE.test(m.sql) && !opts.allowDestructive) {
      throw new Error(`Migração ${m.version} contém operação destrutiva. Faça backup e rode com --allow-destructive.`);
    }
    const stmts: Stmt[] = splitSql(m.sql).map((sql) => ({ sql }));
    stmts.push({ sql: "INSERT INTO od_schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)", args: [m.version, m.name, checksum, new Date().toISOString()] });
    await db.batch(stmts);
    applied.push(m.version);
  }
  return { applied, skipped };
}

/** Código curto de falha no schema. Nunca inclui token, URL ou mensagem bruta. */
export type SchemaError = "http_401" | "http_404" | "tabela_inexistente" | "rede";

export interface SchemaStatus {
  version: string | null;
  error?: SchemaError;
}

export function classifySchemaError(err: unknown): SchemaError {
  const status = err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number" ? (err as { status: number }).status : undefined;
  if (status === 401 || status === 403) return "http_401";
  if (status === 404) return "http_404";
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("no such table")) return "tabela_inexistente";
  return "rede";
}

export async function currentSchema(db: Db): Promise<SchemaStatus> {
  try {
    const rows = await db.query<{ v: string | null }>("SELECT MAX(version) AS v FROM od_schema_migrations");
    return { version: rows[0]?.v ?? null };
  } catch (err) {
    return { version: null, error: classifySchemaError(err) };
  }
}
