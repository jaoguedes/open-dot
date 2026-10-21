// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Orquestrador v0.2 no Worker: guarda o snapshot de ferramentas que o Runner AUTENTICADO envia
 * (nunca o navegador) e devolve ao dono junto com o catálogo. Sem credenciais em nenhum ponto.
 */
import { z } from "zod";
import catalogJson from "../../../../orchestrator/catalog/ferramentas.json";
import { parseCatalog } from "@open-dot/core/orchestrator/catalog.ts";
import { DetectionSnapshotSchema, type DetectionSnapshot } from "@open-dot/core/orchestrator/detection.ts";
import type { Handler } from "../app.ts";
import { json, problem } from "../http.ts";
import { device, read } from "../runner/routes.ts";

type Registrar = (method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) => void;
export const CATALOG = parseCatalog(catalogJson);

export function registerOrchestratorRoutes(route: Registrar) {
  route("POST", "/api/runner/device/tools", { auth: false, csrf: false }, async (ctx, req) => {
    const d = await device(ctx, req);
    if (!d) return problem(401, "device_revoked", "Dispositivo indisponível.");
    const snapshot = DetectionSnapshotSchema.parse(await read(req));
    if (snapshot.observedAt > ctx.now() + 300_000) return problem(400, "invalid_input", "Horário do snapshot no futuro.");
    await ctx.db.run(
      "INSERT INTO od_tool_snapshots(device_id,owner_id,snapshot_json,observed_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,observed_at=excluded.observed_at,updated_at=excluded.updated_at WHERE excluded.observed_at>=od_tool_snapshots.observed_at",
      [d.id, d.owner_id, JSON.stringify(snapshot), snapshot.observedAt, ctx.now()],
    );
    return json({ accepted: true });
  });

  route("GET", "/api/orchestrator/tools", { auth: true }, async (ctx, _req, _p, owner) => {
    const rows = await ctx.db.query<{ device_id: string; name: string; snapshot_json: string; updated_at: number; seen_at: number }>(
      "SELECT s.device_id,d.name,s.snapshot_json,s.updated_at,d.seen_at FROM od_tool_snapshots s JOIN od_runner_devices d ON d.id=s.device_id WHERE s.owner_id=? AND d.revoked_at IS NULL ORDER BY s.updated_at DESC LIMIT 20",
      [owner!],
    );
    const devices = rows.flatMap((r) => {
      const parsed = DetectionSnapshotSchema.safeParse(JSON.parse(r.snapshot_json));
      return parsed.success ? [{ deviceId: r.device_id, name: r.name, online: r.seen_at > ctx.now() - 30_000, updatedAt: r.updated_at, snapshot: parsed.data }] : [];
    });
    return json({ catalog: CATALOG, devices });
  });
}

/** Snapshot mais recente do dono para um dispositivo; null se não houver. */
export async function latestSnapshot(ctx: Parameters<Handler>[0], owner: string, deviceId: string): Promise<DetectionSnapshot | null> {
  const row = (await ctx.db.query<{ snapshot_json: string }>("SELECT snapshot_json FROM od_tool_snapshots WHERE owner_id=? AND device_id=?", [owner, deviceId]))[0];
  if (!row) return null;
  const parsed = DetectionSnapshotSchema.safeParse(JSON.parse(row.snapshot_json));
  return parsed.success ? parsed.data : null;
}

export const DeviceIdSchema = z.string().uuid();
