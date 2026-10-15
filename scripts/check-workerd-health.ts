/**
 * Sobe o Worker no motor real (workerd) e confere /api/health.
 * `npm run dev` roda em Node e não reproduz Illegal invocation do fetch.
 *   npm run test:workerd
 */
import { spawn } from "node:child_process";

const PORT = 8799;
const ORIGIN = `http://localhost:${PORT}`;

function isHealth(v: unknown): v is { ok: boolean; schema: string | null; schemaError?: string | null } {
  return typeof v === "object" && v !== null && "ok" in v && "schema" in v;
}

async function waitReady(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("wrangler dev não ficou pronto")), timeoutMs);
    const onData = (buf: Buffer) => {
      if (String(buf).includes(`Ready on ${ORIGIN}`)) {
        clearTimeout(t);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`wrangler saiu com ${code ?? "?"}`));
    });
  });
}

async function main() {
  const bin = process.env.WRANGLER_BIN;
  const child = bin
    ? spawn(bin, ["dev", "--local", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } })
    : spawn("npx", ["--yes", "wrangler@4", "dev", "--local", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } });
  try {
    await waitReady(child, 150_000);
    const resp = await fetch(`${ORIGIN}/api/health`);
    const body: unknown = await resp.json();
    if (!isHealth(body)) throw new Error("health com formato inesperado");
    console.log(JSON.stringify({ ok: body.ok, schema: body.schema, schemaError: body.schemaError ?? null }));
    if (!body.ok || body.schema !== "0004") process.exit(1);
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
