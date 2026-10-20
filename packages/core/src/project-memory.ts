import { z } from "zod";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const source = z.string().max(240).refine((s) => {
  if (/^(ADR-\d{4}|task:[a-f0-9-]{36}|git:[a-f0-9]{40})$/.test(s)) return true;
  try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
}, "Referência deve ser identificador ou HTTPS sem credencial/query.");

export const MemoryEntrySchema = z.object({
  id,
  kind: z.enum(["requirement", "decision", "preference", "risk", "fact"]),
  provenance: z.enum(["user-approved", "agent-proposed", "inferred", "external-evidence", "superseded"]),
  summary: text,
  sourceRefs: z.array(source).max(20),
  observedAt: z.string().datetime(),
  commit: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
}).strict().superRefine((m, ctx) => {
  if (m.provenance === "external-evidence" && !m.sourceRefs.length) ctx.addIssue({code:"custom",message:"Evidência externa exige referência."});
});

/** Dados não são instruções: importar um Passport não concede ferramentas ou consentimento. */
export const ProjectPassportSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.literal("memory-only"),
  projectId: id,
  revision: z.number().int().min(1).max(1_000_000),
  memories: z.array(MemoryEntrySchema).max(100),
  links: z.array(z.object({from:id,to:id,relation:z.enum(["requires","supports","supersedes"])}).strict()).max(300),
}).strict().superRefine((p, ctx) => {
  const ids = new Set(p.memories.map(m=>m.id));
  if (ids.size !== p.memories.length) ctx.addIssue({code:"custom",message:"Memórias duplicadas."});
  const edges = new Set<string>();
  const dependencies = new Map<string,string[]>();
  for (const l of p.links) {
    const key = `${l.from}:${l.to}:${l.relation}`;
    if (!ids.has(l.from)||!ids.has(l.to)||l.from===l.to||edges.has(key)) ctx.addIssue({code:"custom",message:"Relação duplicada ou sem origem/destino válido."});
    edges.add(key);
    if(l.relation==="requires")dependencies.set(l.from,[...(dependencies.get(l.from)??[]),l.to]);
  }
  const visiting=new Set<string>(),done=new Set<string>();
  function visit(n:string):boolean {
    if(visiting.has(n))return false;if(done.has(n))return true;visiting.add(n);
    for(const next of dependencies.get(n)??[])if(!visit(next))return false;
    visiting.delete(n);done.add(n);return true;
  }
  if([...ids].some(n=>!visit(n)))ctx.addIssue({code:"custom",message:"Dependências de memória contêm ciclo."});
});
export type ProjectPassport = z.infer<typeof ProjectPassportSchema>;

export function serializePassport(input:unknown):string {
  const result=JSON.stringify(ProjectPassportSchema.parse(input));
  if(new TextEncoder().encode(result).length>65536)throw new Error("Passport excede 64 KB.");
  return result;
}
