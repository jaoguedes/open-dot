import { createHash } from "node:crypto";

const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id da versão que está em 100% e foi criada por último. Não usa a posição no array. */
export function activeVersionId(deployments) {
  if (!Array.isArray(deployments)) return null;
  let best = null;
  for (const row of deployments) {
    if (!row || typeof row.created_on !== "string") continue;
    const versions = Array.isArray(row.versions) ? row.versions : [];
    const full = versions.find((v) => v && v.percentage === 100 && typeof v.version_id === "string" && VERSION_ID.test(v.version_id));
    if (!full) continue;
    if (!best || row.created_on > best.created) best = { id: full.version_id, created: row.created_on };
  }
  return best?.id ?? null;
}

export function parseDeploymentsJson(text) {
  const start = text.indexOf("[");
  if (start < 0) return null;
  try {
    const data = JSON.parse(text.slice(start));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Repete a fumaça até o health ok e o app publicado bater o hash, ou até estourar o prazo.
 * `now` e `sleep` existem para o teste não esperar de verdade.
 */
export async function waitForSmoke({ origin, appHash, timeoutMs, fetchImpl, now = Date.now, sleep }) {
  const pause = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const start = now();
  while (now() - start <= timeoutMs) {
    try {
      const health = await (await fetchImpl(`${origin}/api/health`)).json();
      const version = await (await fetchImpl(`${origin}/api/version`)).json();
      const js = await fetchImpl(`${origin}/assets/app.js`);
      const hash = createHash("sha256").update(Buffer.from(await js.arrayBuffer())).digest("hex").slice(0, 12);
      const sw = await (await fetchImpl(`${origin}/sw.js`)).text();
      const missing = await fetchImpl(`${origin}/assets/inexistente`);
      const type = missing.headers?.get?.("content-type") ?? "";
      if (health?.ok === true && version?.app === appHash && hash === appHash && sw.includes(appHash) && missing.status === 404 && !String(type).includes("text/html")) {
        return { ok: true, app: appHash, worker: typeof version.worker === "string" ? version.worker : null };
      }
    } catch {
      /* a versão nova pode ainda não estar no ar */
    }
    if (now() - start >= timeoutMs) break;
    await pause(2000);
  }
  return null;
}
