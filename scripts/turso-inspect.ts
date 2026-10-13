/**
 * Inspeção SOMENTE LEITURA de um banco Turso: lista tabelas, colunas e contagem de linhas.
 * Não altera nada. Use para conferir o banco existente antes de decidir onde o Open Dot mora.
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run turso:inspect
 */
import { HranaDb } from "../apps/worker/src/db/hrana.ts";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) throw new Error("Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente.");
  const db = new HranaDb(url, token);
  const tables = await db.query<{ name: string; type: string }>("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
  console.log(`Banco: ${new URL(url.replace("libsql://", "https://")).host}`);
  console.log(`${tables.length} tabelas/views\n`);
  for (const t of tables) {
    const safe = t.name.replace(/"/g, '""');
    const cols = await db.query<{ name: string; type: string }>(`PRAGMA table_info("${safe}")`);
    let count = "?";
    if (t.type === "table") count = String((await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${safe}"`))[0]?.n ?? "?");
    console.log(`${t.name.startsWith("od_") ? "[open-dot] " : ""}${t.name} (${t.type}, ${count} linhas): ${cols.map((c) => `${c.name} ${c.type}`).join(", ")}`);
  }
  const foreign = tables.filter((t) => !t.name.startsWith("od_") && t.name !== "od_schema_migrations");
  console.log(foreign.length ? "\nRecomendação: este banco tem dados de outro projeto. Use um banco separado para o Open Dot." : "\nBanco sem tabelas de outros projetos.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
