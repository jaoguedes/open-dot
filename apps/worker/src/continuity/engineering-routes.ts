import { z } from "zod";
import type { Handler } from "../app.ts";
import { json, problem } from "../http.ts";
import { read, reconcileRunnerTasks } from "../runner/routes.ts";
import { EngineeringPlanSchema, createEngineeringPlan, listEngineeringPlans, reconcileEngineering } from "./scheduler.ts";
type Registrar = (method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) => void;
export function registerEngineeringRoutes(route: Registrar) {
  route("POST", "/api/runner/plans", { auth: true }, async (ctx, req, _p, owner) => {
    const data = EngineeringPlanSchema.parse(await read(req));
    const device = (await ctx.db.query<{ projects: string }>("SELECT projects FROM od_runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL AND expires_at>?", [data.deviceId, owner!, ctx.now()]))[0];
    if (!device || !JSON.parse(device.projects).some((p: { id: string }) => p.id === data.projectId))
      return problem(403, "folder_denied", "Selecione um projeto autorizado no dispositivo pareado.");
    if(data.rememberResults && !(await ctx.db.query("SELECT 1 FROM od_project_memory_policies WHERE owner_id=? AND project_id=? AND enabled=1 AND expires_at>?",[owner!,data.projectId,ctx.now()])).length)
      return problem(409,"memory_consent_required","Ative a memória deste projeto antes de registrar recibos. Nenhum plano foi criado.");
    try { return json({ id: await createEngineeringPlan(ctx, owner!, data) }, 201); }
    catch { return problem(409, "plan_conflict", "Plano recusado: conflito de identidade, dados sensíveis ou limite. Releia o estado."); }
  });
  route("GET", "/api/runner/plans", { auth: true }, async (ctx, _req, _p, owner) => {
    await reconcileRunnerTasks(ctx); await reconcileEngineering(ctx);
    return json({ plans: await listEngineeringPlans(ctx, owner!) });
  });
  route("POST", "/api/runner/plans/:id/state", { auth: true }, async (ctx, req, p, owner) => {
    const data = z.object({ expectedRevision: z.number().int().min(1), state: z.enum(["active", "paused"]) }).strict().parse(await read(req));
    const result = await ctx.db.run("UPDATE od_engineering_plans SET state=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND state IN ('active','paused')", [data.state, ctx.now(), p.id!, owner!, data.expectedRevision]);
    return result.changes === 1 ? json({ updated: true }) : problem(409, "plan_state_conflict", "Plano alterado ou terminal. Estado incerto exige reconciliação, nunca repetição automática.");
  });
}
