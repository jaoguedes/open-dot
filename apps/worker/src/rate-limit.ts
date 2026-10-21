import { sha256Hex } from "@open-dot/core";
import type { Ctx } from "./context.ts";

/**
 * Limite de taxa para rotas anônimas, em janela fixa. A origem é o IP que o Cloudflare
 * coloca em cf-connecting-ip (o cliente não consegue sobrescrever), guardado só como hash
 * com segredo do servidor. IPv6 conta por /64. Sem o cabeçalho (local/testes), a origem é única.
 */
function expandV6(ip: string): string[] {
  const [head = "", tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(Math.max(0, 8 - left.length - right.length)).fill("0") : [];
  return [...left, ...fill, ...right].map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
}

export function sourceOf(req: Request): string {
  const ip = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (!ip) return "sem-origem";
  if (ip.includes(":")) return expandV6(ip).slice(0, 4).join(":") + "::/64";
  return ip;
}

interface Bucket {
  key: string;
  limit: number;
}

/**
 * Consome uma unidade de cada balde, em ordem. Para no primeiro esgotado: a origem é
 * conferida antes do teto global, então uma origem bloqueada não gasta a cota de todos.
 * Cada passo é uma instrução atômica (upsert condicional).
 */
export async function take(ctx: Ctx, req: Request, scope: string, perSource: number, global: number, windowMs: number): Promise<boolean> {
  const now = ctx.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const source = await sha256Hex(`rate:${ctx.env.TOKEN_KEYS}:${scope}:${sourceOf(req)}`);
  const buckets: Bucket[] = [
    { key: `${scope}:src:${source}`, limit: perSource },
    { key: `${scope}:global`, limit: global },
  ];
  for (const b of buckets) {
    const r = await ctx.db.run(
      "INSERT INTO od_rate_limits(bucket,window_start,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket,window_start) DO UPDATE SET count=count+1 WHERE od_rate_limits.count<?",
      [b.key, windowStart, windowStart + windowMs, b.limit],
    );
    if (r.changes !== 1) return false;
  }
  return true;
}
