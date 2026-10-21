// SPDX-License-Identifier: AGPL-3.0-only
/** Teste de integração: API/SQLite reais e cofre nativo. Sem contas ou bancos de produção. */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { makeCtx } from "../apps/worker/test/harness.ts";
import { handleApi } from "../apps/worker/src/app.ts";
const ctx = await makeCtx({ now: () => Date.now() });
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32000) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const url = `http://localhost:8787${req.url}`; // origem configurada apenas para a sessão local isolada
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const result = await handleApi(ctx, new Request(url, { method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Porta indisponível");
const child = spawn("cargo", ["test", "--manifest-path", "apps/runner/src-tauri/Cargo.toml", "--locked", process.argv.includes("--recovery") ? "recovery_tests::crash_restart" : process.argv.includes("--codex") ? "executor::live_tests::real_codex_flow" : "channel::live_tests::real_channel_and_vault", "--", "--ignored", "--nocapture"], {
  stdio: "inherit",
  env: { ...process.env, OPEN_DOT_CHANNEL_TEST_ORIGIN: `http://127.0.0.1:${address.port}` },
});
const timer = setTimeout(() => child.kill(), 600000);
process.exitCode = await new Promise<number>((resolve) => {
  child.on("exit", (code) => resolve(code ?? 1));
  child.on("error", () => resolve(1));
});
clearTimeout(timer);
server.close();
ctx.db.raw.close();
