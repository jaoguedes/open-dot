// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Migration } from "../../apps/worker/src/db/migrate.ts";

export const MIGRATIONS_DIR = join(new URL("../..", import.meta.url).pathname, "apps/worker/migrations");

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: f.slice(0, 4), name: f.replace(/\.sql$/, ""), sql: readFileSync(join(dir, f), "utf8") }));
}
