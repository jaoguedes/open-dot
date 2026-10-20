import { advanceEngineering } from "../continuity/scheduler.ts";
import { RUNNER_PROTOCOL, APPROVAL_CONTRACT, REQUIRED_CAPABILITIES, runnerHello, runnerCompatible } from "./protocol.ts";
import { currentSchema, REQUIRED_SCHEMA, schemaCompatible } from "../db/migrate.ts";
import { z } from "zod";
import { sha256Hex } from "@open-dot/core";
import type { Handler } from "../app.ts";
import type { Ctx } from "../context.ts";
import { randomToken, seal, open } from "../crypto.ts";
import { json, problem } from "../http.ts";

type Registrar = (method: string, path: string, opts: { auth: boolean; csrf?: boolean }, handler: Handler) => void;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().uuid();
const label = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N} ._()-]+$/u);
const project = z.object({ id, label }).strict();
const features=z.object({version:z.literal(1),proposalGeneration:z.boolean(),approvedHostWrites:z.boolean(),recovery:z.enum(["approved-proposal-only","unavailable"]),projectCommands:z.literal(false),modelsDiscovered:z.literal(false),evidence:z.enum(["local-preflight","diagnostic-only"])}).strict();
const driver = z.object({ id: z.enum(["codex", "claude-code", "cursor"]), installed: z.boolean(), authenticated: z.boolean(), executable: z.boolean(), reason: z.string().max(200),features:features.optional() }).strict().superRefine((d,ctx)=>{
 const f=d.features;if(!f)return;
 const enabled=d.id==="codex"&&d.installed&&d.authenticated&&d.executable;
 if(f.proposalGeneration!==enabled||f.approvedHostWrites!==enabled||f.recovery!==(enabled?"approved-proposal-only":"unavailable")||f.evidence!==(enabled?"local-preflight":"diagnostic-only"))ctx.addIssue({code:"custom",message:"Driver feature claims contradict the validated host profile."});
});
const terminal = new Set(["completed", "failed", "cancelled", "uncertain"]);
interface Device {
  id: string;
  owner_id: string;
  name: string;
  projects: string;
  capabilities: string;
  seen_at: number;
  protocol_version: number;
}
interface Task {
  id: string;
  owner_id: string;
  device_id: string;
  project_id: string;
  mechanism: string;
  prompt_enc: string;
  state: string;
  cancel_requested: number;
  created_at: number;
  updated_at: number;
}
// A declaração de suporte é do Runner autenticado, nunca do navegador.
async function device(ctx: Ctx, req: Request): Promise<Device | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth)) return null;
  const rows = await ctx.db.query<Device>("SELECT * FROM od_runner_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?", [await sha256Hex(auth.slice(7)), ctx.now()]);
  return rows[0] ?? null;
}
export async function read(req: Request): Promise<unknown> {
  // Limite também aplicado após leitura; Content-Length não é autoridade.
  if (Number(req.headers.get("content-length")) > 32_000) throw new SyntaxError();
  if (!req.body) throw new SyntaxError();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_000) {
        await reader.cancel();
        throw new SyntaxError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function safeRunnerText(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[segredo removido]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/g, "[segredo removido]")
    .replace(/\b(Bearer\s+)[\w.+/=-]+/gi, "$1[removido]")
    .replace(/\b([\w.-]*(?:token|secret|password|api[_-]?key)[\w.-]*\s*[=:]\s*)[^\s,;]+/gi, "$1[removido]")
    .split("")
    .filter((c) => (c >= " " && c !== String.fromCharCode(127)) || "\n\r\t".includes(c))
    .join("");
}
// A lease expirada encerra a tentativa, nunca a reentrega. Escritas locais podem ser incertas.
// Chamado por cron e leituras/claim: não depende do Runner voltar à rede.
export async function reconcileRunnerTasks(ctx: Ctx): Promise<void> {
  await ctx.db.run(`UPDATE od_runner_tasks SET state='uncertain',cancel_requested=1,updated_at=?
    WHERE state IN ('running','awaiting_approval','cancel_requested') AND
    (lease_until IS NULL OR lease_until<=? OR EXISTS(SELECT 1 FROM od_runner_devices d WHERE d.id=device_id AND (d.revoked_at IS NOT NULL OR d.expires_at<=?)))`, [ctx.now(),ctx.now(),ctx.now()]);
  await ctx.db.run(`UPDATE od_runner_tasks SET state='failed',cancel_requested=1,updated_at=?
    WHERE state='awaiting_approval' AND EXISTS(SELECT 1 FROM od_runner_approvals a WHERE a.task_id=id AND a.decision='pending' AND a.expires_at<=?)`, [ctx.now(),ctx.now()]);
}
async function revokeDevice(ctx: Ctx, deviceId: string, owner: string): Promise<void> {
  await ctx.db.batch([
    {sql:"UPDATE od_runner_devices SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=?",args:[ctx.now(),deviceId,owner]},
    {sql:`UPDATE od_runner_tasks SET cancel_requested=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE 'uncertain' END,updated_at=?
      WHERE device_id=? AND owner_id=? AND state IN ('queued','running','awaiting_approval','cancel_requested')`,args:[ctx.now(),deviceId,owner]},
  ]);
}
export function registerRunnerRoutes(route: Registrar) {
  route("GET","/api/runner/protocol",{auth:false,csrf:false},async(ctx)=>{
    const schema=await currentSchema(ctx.db);
    return json({version:RUNNER_PROTOCOL,approval:APPROVAL_CONTRACT,capabilities:REQUIRED_CAPABILITIES,driverFeaturesVersion:1,requiredSchema:REQUIRED_SCHEMA,schemaReady:schemaCompatible(schema.version,REQUIRED_SCHEMA)});
  });
  route("POST", "/api/runner/pairings", { auth: false, csrf: false }, async (ctx, req) => {
    const data = z
      .object({ secretHash: hash, tokenHash: hash, name: label })
      .strict()
      .parse(await read(req));
    const n = await ctx.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_runner_pairings WHERE created_at>?", [ctx.now() - 300_000]);
    if ((n[0]?.n ?? 0) >= 30) return problem(429, "rate_limit", "Aguarde cinco minutos para parear.");
    const pairingId = crypto.randomUUID();
    const code = randomToken(12); // 96 bits, exibido só no Runner; consulta web exige sessão.
    await ctx.db.run("DELETE FROM od_runner_pairings WHERE expires_at<?", [ctx.now()]);
    const inserted = await ctx.db.run(
      "INSERT INTO od_runner_pairings(id,code,secret_hash,token_hash,name,expires_at,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM od_runner_pairings WHERE created_at>?)<30",
      [pairingId, code, data.secretHash, data.tokenHash, data.name, ctx.now() + 300_000, ctx.now(), ctx.now() - 300_000],
    );
    if (!inserted.changes) return problem(429, "rate_limit", "Aguarde cinco minutos para parear.");
    return json({ id: pairingId, code, expiresAt: ctx.now() + 300_000 }, 201);
  });
  route("POST", "/api/runner/pairings/:id/status", { auth: false, csrf: false }, async (ctx, req, p) => {
    const data = z
      .object({ secret: z.string().regex(/^[\w-]{43}$/) })
      .strict()
      .parse(await read(req));
    const rows = await ctx.db.query<{ device_id: string | null; expires_at: number }>("SELECT device_id,expires_at FROM od_runner_pairings WHERE id=? AND secret_hash=?", [
      p.id!,
      await sha256Hex(data.secret),
    ]);
    if (!rows[0] || rows[0].expires_at <= ctx.now()) return problem(410, "expired", "Pareamento expirado. Gere outro código.");
    return json({ deviceId: rows[0].device_id });
  });
  route("POST", "/api/runner/pairings/approve", { auth: true }, async (ctx, req, _p, owner) => {
    const data = z
      .object({ code: z.string().regex(/^[\w-]{16}$/), name: label })
      .strict()
      .parse(await read(req));
    const row = (await ctx.db.query<{ id: string; name: string }>("SELECT id,name FROM od_runner_pairings WHERE code=? AND owner_id IS NULL AND expires_at>?", [data.code, ctx.now()]))[0];
    if (!row || row.name !== data.name) return problem(409, "pairing_invalid", "Código, nome ou validade não conferem. Confira no Runner.");
    const results = await ctx.db.batch([
      {
        sql: "INSERT INTO od_runner_devices(id,owner_id,name,token_hash,expires_at,created_at) SELECT id,?,name,token_hash,?,? FROM od_runner_pairings WHERE id=? AND owner_id IS NULL AND expires_at>? AND (SELECT COUNT(*) FROM od_runner_devices WHERE owner_id=? AND revoked_at IS NULL)<20 ON CONFLICT(id) DO NOTHING",
        args: [owner!, ctx.now() + 86400_000, ctx.now(), row.id, ctx.now(), owner!],
      },
      {
        sql: "UPDATE od_runner_pairings SET owner_id=?,device_id=id WHERE id=? AND owner_id IS NULL AND EXISTS(SELECT 1 FROM od_runner_devices WHERE id=? AND owner_id=?)",
        args: [owner!, row.id, row.id, owner!],
      },
    ]);
    if (!results[0]?.changes) return problem(409, "pairing_used", "Código já utilizado ou limite de 20 dispositivos atingido.");
    return json({ deviceId: row.id }, 201);
  });
  route("GET", "/api/runner/devices", { auth: true }, async (ctx, _r, _p, owner) => {
    const rows = await ctx.db.query<Device & { revoked_at: number | null; expires_at: number }>(
      "SELECT id,owner_id,name,projects,capabilities,seen_at,protocol_version,revoked_at,expires_at FROM od_runner_devices WHERE owner_id=? ORDER BY created_at DESC LIMIT 20",
      [owner!],
    );
    return json({
      devices: rows.map((d) => ({
        id: d.id,
        name: d.name,
        online: !d.revoked_at && d.expires_at > ctx.now() && d.seen_at > ctx.now() - 30_000,
        revoked: d.revoked_at !== null,
        compatible: d.protocol_version===RUNNER_PROTOCOL,
        compatibilityReason: d.protocol_version===RUNNER_PROTOCOL ? "Protocolo compatível" : "Atualize o Runner: protocolo ou contrato de aprovação incompatível.",
        seenAt: d.seen_at,
        projects: JSON.parse(d.projects),
        drivers: JSON.parse(d.capabilities),
      })),
    });
  });
  route("POST", "/api/runner/devices/:id/revoke", { auth: true }, async (ctx, _r, p, owner) => {
    await revokeDevice(ctx, p.id!, owner!);
    return json({ revoked: true });
  });
  route("POST", "/api/runner/device/revoke", {auth:false,csrf:false}, async(ctx,req)=>{
    const d=await device(ctx,req);if(!d)return problem(401,"device_revoked","Dispositivo já revogado ou expirado.");
    await revokeDevice(ctx,d.id,d.owner_id);
    return json({revoked:true});
  });
  route("POST", "/api/runner/device/heartbeat", { auth: false, csrf: false }, async (ctx, req) => {
    const d = await device(ctx, req);
    if (!d) return problem(401, "device_revoked", "Pareie novamente: dispositivo revogado ou sessão expirada.");
    const data = z
      .object({ projects: z.array(project).max(20), drivers: z.array(driver).max(3), protocol:runnerHello.optional() })
      .strict()
      .parse(await read(req));
    if (new Set(data.projects.map((p) => p.id)).size !== data.projects.length || new Set(data.drivers.map((p) => p.id)).size !== data.drivers.length) throw new SyntaxError();
    const compatible=runnerCompatible(data.protocol);
    const updated = await ctx.db.run("UPDATE od_runner_devices SET projects=?,capabilities=?,seen_at=?,expires_at=?,protocol_version=? WHERE id=? AND revoked_at IS NULL", [
      JSON.stringify(data.projects),
      JSON.stringify(data.drivers),
      ctx.now(),
      ctx.now() + 86400_000,
      compatible?RUNNER_PROTOCOL:0,
      d.id,
    ]);
    if (!updated.changes) return problem(401, "device_revoked", "Dispositivo revogado.");
    await reconcileRunnerTasks(ctx);
    await ctx.db.run("UPDATE od_runner_tasks SET lease_until=MIN(?,attempt_deadline) WHERE device_id=? AND state IN ('running','awaiting_approval')",[ctx.now()+30_000,d.id]);
    const active = await ctx.db.query<{ id: string; cancel_requested: number }>("SELECT id,cancel_requested FROM od_runner_tasks WHERE device_id=? AND state IN ('running','awaiting_approval','cancel_requested','uncertain')", [d.id]);
    return json({ active, serverTime: ctx.now(), compatible, protocolVersion:RUNNER_PROTOCOL, reason:compatible?null:"Atualize o Runner e confira o contrato de aprovação." });
  });
  route("POST", "/api/runner/tasks", { auth: true }, async (ctx, req, _p, owner) => {
    const data = z
      .object({ deviceId: id, projectId: id, mechanism: z.enum(["codex", "claude-code", "cursor"]), prompt: z.string().trim().min(1).max(8000), requestKey: id, worktreeConsent:z.literal(true) })
      .strict()
      .parse(await read(req));
    const existing = (await ctx.db.query<{ id: string }>("SELECT id FROM od_runner_tasks WHERE owner_id=? AND request_key=?", [owner!, data.requestKey]))[0];
    if (existing) return json({ id: existing.id });
    const d = (
      await ctx.db.query<Device>("SELECT * FROM od_runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL AND expires_at>? AND seen_at>?", [
        data.deviceId,
        owner!,
        ctx.now(),
        ctx.now() - 30_000,
      ])
    )[0];
    if(d && d.protocol_version!==RUNNER_PROTOCOL) return problem(409,"runner_incompatible","Runner incompatível. Atualize antes de enviar tarefas.");
    if (!d) return problem(409, "runner_offline", "Runner indisponível. Abra o aplicativo e atualize.");
    if (!(JSON.parse(d.projects) as Array<{ id: string }>).some((p) => p.id === data.projectId)) return problem(403, "folder_denied", "Pasta não autorizada no Runner.");
    if (!(JSON.parse(d.capabilities) as Array<z.infer<typeof driver>>).some((v) => v.id === data.mechanism && v.executable && v.authenticated))
      return problem(409, "driver_unavailable", "Mecanismo sem autenticação ou sem execução segura disponível.");
    const count = await ctx.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_runner_tasks WHERE device_id=? AND state IN ('queued','running','awaiting_approval')", [d.id]);
    if ((count[0]?.n ?? 0) >= 10) return problem(429, "queue_full", "Limite de dez tarefas pendentes.");
    const taskId = crypto.randomUUID();
    await ctx.db.run(
      "INSERT INTO od_runner_tasks(id,owner_id,device_id,project_id,mechanism,prompt_enc,state,request_key,created_at,updated_at,worktree_consent) VALUES(?,?,?,?,?,?,'queued',?,?,?,1) ON CONFLICT(owner_id,request_key) DO NOTHING",
      [taskId, owner!, d.id, data.projectId, data.mechanism, await seal(ctx.keys, data.prompt, `runner:${owner}:${taskId}`), data.requestKey, ctx.now(), ctx.now()],
    );
    const stored = (await ctx.db.query<{ id: string }>("SELECT id FROM od_runner_tasks WHERE owner_id=? AND request_key=?", [owner!, data.requestKey]))[0]!;
    return json({ id: stored.id }, stored.id === taskId ? 201 : 200);
  });
  // Metadados mínimos para reconciliar crash após claim e antes do journal local.
  // Não reentrega prompt nem concede nova execução de modelo.
  route("GET", "/api/runner/device/active", { auth: false, csrf: false }, async (ctx, req) => {
    const d = await device(ctx, req);
    if (!d) return problem(401, "device_revoked", "Dispositivo indisponível.");
    await reconcileRunnerTasks(ctx);
    const active = await ctx.db.query<{ id: string; projectId: string; seq: number }>(
      "SELECT t.id,t.project_id AS projectId,COALESCE((SELECT MAX(e.seq) FROM od_runner_events e WHERE e.task_id=t.id),0) AS seq FROM od_runner_tasks t WHERE t.device_id=? AND t.state IN ('running','awaiting_approval','cancel_requested') ORDER BY t.created_at,t.id LIMIT 2",
      [d.id],
    );
    return json({ active });
  });
  route("POST", "/api/runner/device/claim", { auth: false, csrf: false }, async (ctx, req) => {
    const d = await device(ctx, req);
    if (!d) return problem(401, "device_revoked", "Dispositivo indisponível.");
    await reconcileRunnerTasks(ctx);
    if(d.protocol_version!==RUNNER_PROTOCOL) return problem(409,"runner_incompatible","Negocie protocolo antes de executar.");
    await advanceEngineering(ctx, d.id);
    // CAS em uma instrução: um processo por dispositivo; nunca reentregar running após reconexão.
    const tasks = await ctx.db.query<Task>(
      "UPDATE od_runner_tasks SET state='running',updated_at=?,lease_until=?,attempt_deadline=? WHERE id=(SELECT id FROM od_runner_tasks WHERE device_id=? AND state='queued' ORDER BY created_at,id LIMIT 1) AND state='queued' AND worktree_consent=1 AND NOT EXISTS(SELECT 1 FROM od_runner_tasks WHERE device_id=? AND state IN ('running','awaiting_approval','cancel_requested')) AND EXISTS(SELECT 1 FROM od_runner_devices WHERE id=? AND revoked_at IS NULL AND protocol_version=2) RETURNING *",
      [ctx.now(), ctx.now()+30_000, ctx.now()+1_200_000, d.id, d.id, d.id],
    );
    const t = tasks[0];
    if (!t) return json({ task: null });
    return json({ task: { id: t.id, projectId: t.project_id, mechanism: t.mechanism, worktreeConsent:true, prompt: await open(ctx.keys, t.prompt_enc, `runner:${t.owner_id}:${t.id}`) } });
  });
  route("POST", "/api/runner/device/tasks/:id/event", { auth: false, csrf: false }, async (ctx, req, p) => {
    const d = await device(ctx, req);
    if (!d) return problem(401, "device_revoked", "Dispositivo indisponível.");
    const data = z
      .object({ seq: z.number().int().min(1).max(500), kind: z.enum(["status", "message", "files", "tests", "completed", "failed", "cancelled", "uncertain", "proposal"]), text: z.string().max(20000) })
      .strict()
      .parse(await read(req));
    await reconcileRunnerTasks(ctx);
    const t = (await ctx.db.query<Task>("SELECT * FROM od_runner_tasks WHERE id=? AND device_id=?", [p.id!, d.id]))[0];
    if (!t) return problem(404, "not_found", "Tarefa indisponível.");
    const eventDigest=await sha256Hex(JSON.stringify([data.kind,data.text]));
    const prior=(await ctx.db.query<{kind:string;payload_enc:string;digest:string|null}>("SELECT kind,payload_enc,digest FROM od_runner_events WHERE task_id=? AND seq=?",[t.id,data.seq]))[0];
    if(prior){
      const same=prior.digest ? prior.digest===eventDigest : prior.kind===data.kind && await open(ctx.keys,prior.payload_enc,`runner:event:${t.id}:${data.seq}`)===data.text;
      return same ? json({accepted:true,duplicate:true}) : problem(409,"event_conflict","Sequência já pertence a outro conteúdo.");
    }
    const stopping=t.state==='cancel_requested';
    if(t.state!=='running' && !(t.state==='awaiting_approval' && ['failed','cancelled','uncertain'].includes(data.kind)) && !(stopping && terminal.has(data.kind))) return problem(409,"task_closed","Tentativa encerrada ou aguardando parada.");
    // O recibo tardio de conclusão após pedido de parada não comprova ausência de efeitos.
    const nextState=stopping && data.kind!=='cancelled' ? 'uncertain' : data.kind==='proposal'?'awaiting_approval':terminal.has(data.kind)?data.kind:'running';
    const budget = data.kind === "status" || data.kind === "message" ? 490 : data.kind === "proposal" ? 496 : data.kind === "files" ? 498 : data.kind === "tests" ? 499 : 500;
    if (data.seq > budget) return problem(409, "event_budget", "Limite de progresso atingido; orçamento reservado para conclusão ou falha.");
    let proposalDigest: string | null = null;
    let proposalEnc: string | null = null;
    if (data.kind === "proposal") {
      if ((await ctx.db.query("SELECT task_id FROM od_runner_approvals WHERE task_id=?",[t.id])).length) return problem(409,"proposal_exists","Esta tarefa já possui uma proposta. Não vou substituir o conteúdo aprovado.");
      const proposal = z.object({ summary: z.string().max(1200), files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(8000), beforeHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), beforeContent:z.string().max(8000).optional() }).strict()).min(1).max(8) }).strict().parse(JSON.parse(data.text));
      if (safeRunnerText(data.text) !== data.text || proposal.files.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0) > 8000) return problem(400, "proposal_sensitive", "Proposta grande ou com padrão de segredo. Nenhum conteúdo foi publicado.");
      for(const f of proposal.files){
        if(f.beforeHash && (f.beforeContent===undefined || await sha256Hex(f.beforeContent)!==f.beforeHash)) return problem(400,"proposal_before_missing","Conteúdo anterior exato é necessário para revisar substituição.");
        if(!f.beforeHash && f.beforeContent!==undefined) return problem(400,"proposal_before_conflict","Arquivo novo não pode declarar conteúdo anterior.");
      }
      proposalDigest = await sha256Hex(data.text);
      proposalEnc = await seal(ctx.keys, data.text, `runner:proposal:${t.id}`);
    }
    const storedKind=stopping && data.kind!=="cancelled" ? "uncertain" : data.kind;
    const payload = await seal(ctx.keys, safeRunnerText(storedKind!==data.kind ? `Recibo tardio após pedido de parada; efeitos incertos. ${data.text}` : data.text), `runner:event:${t.id}:${data.seq}`);
    const result=await ctx.db.batch([
      ...(proposalDigest && proposalEnc ? [{ sql: "INSERT INTO od_runner_approvals(task_id,digest,proposal_enc,expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM od_runner_tasks WHERE id=? AND state='running' AND cancel_requested=0 AND (SELECT COALESCE(MAX(seq),0) FROM od_runner_events WHERE task_id=?)<?) ON CONFLICT(task_id) DO NOTHING", args: [t.id, proposalDigest, proposalEnc, ctx.now()+600_000, t.id, t.id, data.seq] }] : []),
      {
        sql: "INSERT INTO od_runner_events(task_id,seq,kind,payload_enc,created_at,digest) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM od_runner_tasks WHERE id=? AND state=?) AND (SELECT COALESCE(MAX(seq),0) FROM od_runner_events WHERE task_id=?)<? AND (? IS NULL OR EXISTS(SELECT 1 FROM od_runner_approvals WHERE task_id=? AND proposal_enc=? AND digest=?)) ON CONFLICT(task_id,seq) DO NOTHING",
        args: [t.id, data.seq, storedKind, payload, ctx.now(), eventDigest, t.id, t.state, t.id, data.seq, proposalEnc, t.id, proposalEnc, proposalDigest],
      },
      {
        sql: "UPDATE od_runner_tasks SET state=?,updated_at=? WHERE id=? AND state=? AND EXISTS(SELECT 1 FROM od_runner_events WHERE task_id=? AND seq=? AND payload_enc=?)",
        args: [nextState, ctx.now(), t.id, t.state, t.id, data.seq, payload],
      },
    ]);
    if(!result.at(-2)?.changes || !result.at(-1)?.changes) return problem(409,"event_raced","Evento não confirmado: estado ou sequência mudou. Consulte os recibos antes de reenviar.");
    return json({ accepted: true, proposalHash: proposalDigest });
  });
  route("GET", "/api/runner/tasks", { auth: true }, async (ctx, _r, _p, owner) => {
    await reconcileRunnerTasks(ctx);
    const tasks = await ctx.db.query(
      "SELECT id,device_id AS deviceId,project_id AS projectId,mechanism,state,cancel_requested AS cancelRequested,created_at AS createdAt,updated_at AS updatedAt FROM od_runner_tasks WHERE owner_id=? ORDER BY created_at DESC LIMIT 50",
      [owner!],
    );
    return json({ tasks });
  });
  route("GET", "/api/runner/tasks/:id/events", { auth: true }, async (ctx, _r, p, owner) => {
    const t = (await ctx.db.query<{ id: string }>("SELECT id FROM od_runner_tasks WHERE id=? AND owner_id=?", [p.id!, owner!]))[0];
    if (!t) return problem(404, "not_found", "Tarefa indisponível.");
    const rows = await ctx.db.query<{ seq: number; kind: string; payload_enc: string; created_at: number }>("SELECT * FROM od_runner_events WHERE task_id=? ORDER BY seq LIMIT 500", [t.id]);
    const approval=(await ctx.db.query<{digest:string;decision:string;expires_at:number}>("SELECT digest,decision,expires_at FROM od_runner_approvals WHERE task_id=?",[t.id]))[0];
    const raw=approval ? (await ctx.db.query<{proposal_enc:string}>("SELECT proposal_enc FROM od_runner_approvals WHERE task_id=?",[t.id]))[0] : null;
    return json({ approval:approval?{raw:raw?await open(ctx.keys,raw.proposal_enc,`runner:proposal:${t.id}`):null,hash:approval.digest,decision:approval.expires_at<=ctx.now()&&approval.decision==='pending'?'expired':approval.decision,expiresAt:approval.expires_at}:null,events: await Promise.all(rows.map(async (e) => ({ seq: e.seq, kind: e.kind, text: await open(ctx.keys, e.payload_enc, `runner:event:${t.id}:${e.seq}`), at: e.created_at }))) });
  });
  route("POST", "/api/runner/tasks/:id/cancel", { auth: true }, async (ctx, _r, p, owner) => {
    await ctx.db.run(
      `UPDATE od_runner_tasks SET cancel_requested=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE 'cancel_requested' END,
       lease_until=CASE WHEN state='queued' THEN lease_until ELSE MIN(COALESCE(lease_until,?),?) END,updated_at=?
       WHERE id=? AND owner_id=? AND state IN ('queued','running','awaiting_approval')`,
      [ctx.now()+30_000,ctx.now()+30_000,ctx.now(),p.id!,owner!],
    );
    return json({ requested: true });
  });
  route("GET", "/api/runner/device/tasks/:id/approval", { auth: false, csrf: false }, async (ctx, req, p) => {
    const d=await device(ctx,req);if(!d)return problem(401,"device_revoked","Dispositivo revogado.");
    await reconcileRunnerTasks(ctx);
    const task=(await ctx.db.query<{state:string;cancel_requested:number}>("SELECT state,cancel_requested FROM od_runner_tasks WHERE id=? AND device_id=?",[p.id!,d.id]))[0];
    if(!task)return problem(404,"not_found","Tarefa não encontrada.");
    const row=(await ctx.db.query<{digest:string;proposal_enc:string;decision:string;expires_at:number}>("SELECT * FROM od_runner_approvals WHERE task_id=?",[p.id!]))[0];
    const report=await ctx.db.query<{seq:number;kind:string}>("SELECT seq,kind FROM od_runner_events WHERE task_id=? ORDER BY seq LIMIT 500",[p.id!]);
    const status={state:task.state,cancelRequested:task.cancel_requested,lastSeq:report.at(-1)?.seq??0,reported:report.map(e=>e.kind)};
    if(!row)return json({...status,decision:"missing"});
    return json({...status,hash:row.digest,decision:row.expires_at<=ctx.now()&&row.decision==='pending'?'expired':row.decision,expiresAt:row.expires_at,proposal:JSON.parse(await open(ctx.keys,row.proposal_enc,`runner:proposal:${p.id}`))});
  });
  route("POST", "/api/runner/tasks/:id/decision", { auth: true }, async (ctx, req, p, owner) => {
    const data=z.object({hash,decision:z.enum(["approve","reject"])}).strict().parse(await read(req));
    await reconcileRunnerTasks(ctx);
    const now=ctx.now();
    const result=await ctx.db.batch([
      {sql:"UPDATE od_runner_approvals SET decision=?,decided_at=? WHERE task_id=? AND digest=? AND decision='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM od_runner_tasks t JOIN od_runner_devices d ON d.id=t.device_id WHERE t.id=? AND t.owner_id=? AND t.state='awaiting_approval' AND d.revoked_at IS NULL)",args:[data.decision,now,p.id!,data.hash,now,p.id!,owner!]},
      {sql:"UPDATE od_runner_tasks SET state=CASE WHEN ?='approve' THEN 'running' ELSE 'cancelled' END,cancel_requested=CASE WHEN ?='reject' THEN 1 ELSE 0 END,updated_at=? WHERE id=? AND owner_id=? AND state='awaiting_approval' AND EXISTS(SELECT 1 FROM od_runner_approvals WHERE task_id=? AND digest=? AND decision=? AND decided_at=?)",args:[data.decision,data.decision,now,p.id!,owner!,p.id!,data.hash,data.decision,now]}
    ]);
    if(!result[0]?.changes)return problem(409,"approval_stale","Aprovação usada, expirada, alterada ou revogada. Nenhuma nova permissão foi concedida.");
    return json({decision:data.decision});
  });

}
