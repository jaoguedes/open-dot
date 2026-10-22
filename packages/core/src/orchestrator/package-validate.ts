// SPDX-License-Identifier: AGPL-3.0-only
/** Validação de pacote importado (só no servidor): carregador comum + regras de importação. */
import type { AgentFiles } from "./agent-basics.ts";
import { loadAgentPackage, type AgentPackage } from "./agents.ts";
import { PackageImportError } from "./package-import.ts";

export async function validateImport(files: AgentFiles, existingIds: string[]): Promise<AgentPackage> {
  const pkg = await loadAgentPackage(files);
  if (pkg.meta.nivel !== "experimental") throw new PackageImportError("Pacote importado precisa declarar nivel: experimental.");
  if (existingIds.includes(pkg.meta.id)) throw new PackageImportError(`Já existe um agente com o id ${pkg.meta.id}.`);
  return pkg;
}
