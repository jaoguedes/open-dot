/**
 * Aplica migrações no banco do Open Dot.
 *   npm run db:migrate                 → SQLite local (.data/dev.sqlite)
 *   npm run db:migrate -- --remote     → Turso (lê TURSO_DATABASE_URL e TURSO_AUTH_TOKEN do ambiente)
 *
 * Segurança: no modo remoto, recusa bancos que já tenham tabelas que não sejam do Open Dot
 * (prefixo od_), para não misturar com bancos de outros projetos. Nunca roda DROP/DELETE.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SqliteDb } from "../apps/worker/src/db/sqlite.ts";
import { HranaDb } from "../apps/worker/src/db/hrana.ts";
import { applyMigrations } from "../apps/worker/src/db/migrate.ts";
import { loadMigrations } from "./lib/migrations.ts";

const remote = process.argv.includes("--remote");
const allowShared = process.argv.includes("--i-understand-shared-database");

async function main() {
  const root = new URL("..", import.meta.url).pathname;
  let db;
  if (remote) {
    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;
    if (!url || !token) throw new Error("Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente (não cole no chat).");
    db = new HranaDb(url, token);
    const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'");
    const foreign = tables.map((t) => t.name).filter((n) => !n.startsWith("od_"));
    if (foreign.length && !allowShared) {
      console.error(`Este banco já tem tabelas de outro projeto (${foreign.slice(0, 8).join(", ")}${foreign.length > 8 ? "…" : ""}).`);
      console.error("Crie um banco separado para o Open Dot (docs/SETUP.md). Nada foi alterado.");
      process.exit(2);
    }
    console.log(`Banco remoto: presente (${tables.length} tabelas existentes)`);
  } else {
    mkdirSync(join(root, ".data"), { recursive: true });
    db = new SqliteDb(join(root, ".data/dev.sqlite"));
  }
  const r = await applyMigrations(db, loadMigrations());
  console.log(`Aplicadas: ${r.applied.join(", ") || "nenhuma"} · já existentes: ${r.skipped.join(", ") || "nenhuma"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
