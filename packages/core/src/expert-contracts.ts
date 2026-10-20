import { z } from "zod";

const readTools = z.enum(["source_read", "structured_output", "git_diff", "test_receipt_read", "approved_test_runner"]);
const forbidden = z.enum(["unrestricted_shell", "credential_read", "production_deploy", "external_network_scan"]);
export const ExpertContractSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9-]{2,60}$/),
    purpose: z.string().min(10).max(500),
    skills: z.array(z.string().min(1).max(80)).min(1).max(20),
    allowed_tools: z.array(readTools).min(1).max(5),
    disallowed_tools: z.array(forbidden).length(4),
    required_context: z
      .array(z.string().regex(/^[a-z_]{3,80}$/))
      .min(1)
      .max(20),
    deliverables: z.array(z.string().min(3).max(240)).min(1).max(20),
    acceptance_criteria: z.array(z.string().min(10).max(500)).min(1).max(20),
    risk_class: z.enum(["low", "medium", "high"]),
    review_policy: z.object({ deterministic_tests_required: z.literal(true), require_independent_review_for_critical: z.boolean() }).strict(),
    model_requirements: z.object({ required_capabilities: z.array(z.enum(["code_reading", "structured_output", "visual_inspection"])).min(1), entitlement_check: z.literal(true) }).strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (new Set(p.allowed_tools).size !== p.allowed_tools.length || new Set(p.disallowed_tools).size !== 4) ctx.addIssue({ code: "custom", message: "Ferramentas duplicadas." });
    if (p.risk_class === "high" && !p.review_policy.require_independent_review_for_critical) ctx.addIssue({ code: "custom", message: "Risco alto exige revisão independente." });
  });
export type ExpertContract = z.infer<typeof ExpertContractSchema>;

const definitions = [
  ["staff-architect", "Planejar fronteiras modulares e decisões arquiteturais", "architecture", "Alternativas e consequências em ADR, contratos e riscos verificáveis.", "high"],
  ["backend-data", "Proteger integridade de APIs, dados e migrações", "data_integrity", "Testes de escopo, concorrência, migração e rollback ou limite explícito.", "high"],
  ["frontend-accessibility", "Verificar navegação, estados e acessibilidade", "accessibility", "Testar teclado, estados de erro, mobile e acessibilidade com evidências.", "medium"],
  ["product-design", "Validar clareza dos fluxos preservando identidade aprovada", "interaction_design", "Conferir tokens e fluxos; preservar Dot e paleta, sem redesign não solicitado.", "medium"],
  ["application-security", "Revisar segurança defensiva e menor privilégio", "threat_modeling", "Cada achado alto tem arquivo, reprodução e teste negativo; pendências explícitas.", "high"],
  ["qa-sdet", "Construir evidências reproduzíveis para falhas e regressões", "failure_testing", "Separar real/simulado/não executado e testar caminhos de falha relevantes.", "medium"],
  ["devops-release", "Verificar builds, proveniência e recuperação operacional", "build_provenance", "Registrar SHA, artefatos e checksums; nenhuma publicação sem aprovação.", "high"],
  ["license-review", "Inventariar licenças e pontos para revisão humana", "license_inventory", "Listar fontes e dúvidas para revisão humana; não emitir parecer jurídico definitivo.", "medium"],
  [
    "performance-reliability",
    "Medir recursos, limites e comportamento após falha",
    "resource_profiling",
    "Medições reproduzíveis antes/depois, timeouts e limitações sem números inventados.",
    "medium",
  ],
  ["technical-writing", "Documentar instalação, decisões e continuidade verificável", "documentation", "Validar comandos/links e exemplos fictícios; não incluir dados pessoais ou segredos.", "low"],
] as const;

/** Perfis são contratos de qualidade, não instâncias autenticadas nem autorização de ferramentas. */
export const EXPERT_CONTRACTS: readonly ExpertContract[] = definitions.map(([id, purpose, skill, criterion, risk]) =>
  ExpertContractSchema.parse({
    version: 1,
    id,
    purpose,
    skills: [skill],
    allowed_tools: ["source_read", "structured_output", "git_diff", "test_receipt_read"],
    disallowed_tools: ["unrestricted_shell", "credential_read", "production_deploy", "external_network_scan"],
    required_context: ["project_requirements", "approved_adrs", "relevant_source_paths"],
    deliverables: [`review_${id.replaceAll("-", "_")}`],
    acceptance_criteria: [criterion],
    risk_class: risk,
    review_policy: { deterministic_tests_required: true, require_independent_review_for_critical: risk === "high" },
    model_requirements: { required_capabilities: ["code_reading", "structured_output"], entitlement_check: true },
  }),
);

/** Apenas elegibilidade. A execução ainda precisa de consentimento e enforcement no host. */
export function eligibleExpertTools(input: unknown, hostPolicy: readonly string[], discovered: readonly string[]): string[] {
  const p = ExpertContractSchema.parse(input);
  return p.allowed_tools.filter((tool) => hostPolicy.includes(tool) && discovered.includes(tool));
}
