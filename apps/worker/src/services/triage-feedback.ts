import { senderDomain, sha256Hex } from "@open-dot/core";

/** Hash do domínio do remetente, por dono. O domínio em claro nunca vai para o banco. */
export async function domainHash(ownerId: string, domain: string): Promise<string> {
  return sha256Hex(`triage:${ownerId}:${domain.toLowerCase()}`);
}

/** Domínios do lote cujo hash está no conjunto (silenciados ou de confiança). */
export async function domainsMatching(ownerId: string, froms: string[], hashes: ReadonlySet<string>): Promise<Set<string>> {
  const out = new Set<string>();
  if (!hashes.size) return out;
  for (const f of froms) {
    const d = senderDomain(f);
    if (d && !out.has(d) && hashes.has(await domainHash(ownerId, d))) out.add(d);
  }
  return out;
}
