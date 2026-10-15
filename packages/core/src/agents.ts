import type { AgentId, DataClass } from "./types.ts";

/**
 * Agentes são perfis de tarefa: instruções, ferramentas permitidas e orçamento.
 * Não são processos permanentes. O supervisor (código determinístico) decide
 * o que pode ser executado — nunca o modelo.
 */

export type ToolName =
  | "gmail.read"
  | "gmail.draft"
  | "gmail.send"
  | "github.read"
  | "github.issue.create"
  | "github.comment"
  | "vercel.read"
  | "vercel.redeploy"
  | "http.check"
  | "feed.read"
  | "feed.publish"
  | "rss.read"
  | "quotes.read"
  | "gsc.read"
  | "tracking.read";

export type ToolKind = "read" | "write";

export const TOOL_KIND: Record<ToolName, ToolKind> = {
  "gmail.read": "read",
  "gmail.draft": "write",
  "gmail.send": "write",
  "github.read": "read",
  "github.issue.create": "write",
  "github.comment": "write",
  "vercel.read": "read",
  "vercel.redeploy": "write",
  "http.check": "read",
  "feed.read": "read",
  "feed.publish": "write",
  "rss.read": "read",
  "quotes.read": "read",
  "gsc.read": "read",
  "tracking.read": "read",
};

/** Escritas que exigem aprovação vinculada ao payload, sempre. */
export const REQUIRES_APPROVAL: ReadonlySet<ToolName> = new Set([
  "gmail.draft",
  "gmail.send",
  "github.issue.create",
  "github.comment",
  "vercel.redeploy",
]);

/** Ferramentas internas que o sistema executa sem aprovação (não saem para terceiros). */
const INTERNAL_WRITES: ReadonlySet<ToolName> = new Set(["feed.publish"]);

export interface AgentProfile {
  id: AgentId;
  name: string;
  description: string;
  tools: readonly ToolName[];
  /** Maior classe de dado que o perfil manipula. */
  dataClass: DataClass;
  maxModelStepsPerJob: number;
  maxToolCallsPerStep: number;
}

export const AGENTS: Record<AgentId, AgentProfile> = {
  dot: {
    id: "dot",
    name: "Dot",
    description: "Seu assistente pessoal. Responde com base no que os outros agentes encontraram.",
    tools: ["feed.read"],
    dataClass: "private_email",
    maxModelStepsPerJob: 3,
    maxToolCallsPerStep: 5,
  },
  correio: {
    id: "correio",
    name: "Correio",
    description: "Revisa e-mails às 08h e 17h, separa o que precisa de você e prepara rascunhos.",
    tools: ["gmail.read", "feed.publish", "gmail.draft"],
    dataClass: "private_email",
    maxModelStepsPerJob: 3,
    maxToolCallsPerStep: 5,
  },
  codigo: {
    id: "codigo",
    name: "Código",
    description: "Acompanha PRs, issues e workflows dos repositórios escolhidos.",
    tools: ["github.read", "feed.publish", "github.issue.create", "github.comment"],
    dataClass: "private_code",
    maxModelStepsPerJob: 3,
    maxToolCallsPerStep: 5,
  },
  sentinela: {
    id: "sentinela",
    name: "Sentinela",
    description: "Verifica seus sites e deployments da Vercel e informa sinais, não diagnósticos.",
    tools: ["http.check", "vercel.read", "feed.publish", "vercel.redeploy"],
    dataClass: "personal",
    maxModelStepsPerJob: 2,
    maxToolCallsPerStep: 5,
  },
  social: {
    id: "social",
    name: "Social",
    description: "Planejado: Insights de conta profissional elegível do Instagram.",
    tools: [],
    dataClass: "personal",
    maxModelStepsPerJob: 0,
    maxToolCallsPerStep: 0,
  },
  foco: {
    id: "foco",
    name: "Foco",
    description: "Timer e tarefas locais. Não usa IA.",
    tools: [],
    dataClass: "personal",
    maxModelStepsPerJob: 0,
    maxToolCallsPerStep: 0,
  },
  noticias: {
    id: "noticias",
    name: "Notícias",
    description: "Lê feeds RSS/Atom públicos da allowlist (tecnologia, mundo, Brasil, política). Sem scraping de paywall. Tom neutro; política só com ≥ 2 veículos.",
    tools: ["rss.read", "feed.publish"],
    dataClass: "public",
    maxModelStepsPerJob: 2,
    maxToolCallsPerStep: 4,
  },
  mercado: {
    id: "mercado",
    name: "Mercado",
    description: "Cotações públicas (cripto, câmbio, ações). Só informativo, não é recomendação. Sem corretora, carteira ou ordem.",
    tools: ["quotes.read", "feed.publish"],
    dataClass: "public",
    maxModelStepsPerJob: 1,
    maxToolCallsPerStep: 4,
  },
  marketing: {
    id: "marketing",
    name: "Marketing",
    description: "Métricas de leitura: Vercel Analytics (se o plano gratuito tiver) e Search Console. Redes sociais ficam planejadas. Ideias de post são rascunho; publicar nunca é automático.",
    tools: ["vercel.read", "gsc.read", "feed.publish"],
    dataClass: "personal",
    maxModelStepsPerJob: 2,
    maxToolCallsPerStep: 4,
  },
  entregas: {
    id: "entregas",
    name: "Entregas",
    description: "Acompanha encomendas em modo somente leitura. Não compra, não altera entrega e não envia dado pessoal à transportadora — só o código de rastreio, quando um provedor está ligado.",
    tools: ["tracking.read"],
    dataClass: "personal",
    maxModelStepsPerJob: 0,
    maxToolCallsPerStep: 2,
  },
};

export interface ToolRequest {
  agentId: AgentId;
  tool: string;
  ownerId: string;
  /** Dono do recurso, conforme o banco — nunca conforme o modelo. */
  resourceOwnerId: string;
  /** Aprovação válida e ainda compatível com o payload (verificada antes). */
  approvalValid?: boolean;
  /** Origem da solicitação. Conteúdo externo nunca autoriza nada. */
  origin: "user" | "routine" | "model";
  stepToolCalls: number;
}

export type ToolDecision = { allow: true } | { allow: false; reason: string };

/** Supervisor determinístico de permissões. */
export function authorizeTool(req: ToolRequest): ToolDecision {
  const profile = AGENTS[req.agentId];
  if (!isToolName(req.tool)) return { allow: false, reason: "ferramenta desconhecida" };
  if (!profile.tools.includes(req.tool)) return { allow: false, reason: `${profile.name} não tem a ferramenta ${req.tool}` };
  if (req.ownerId !== req.resourceOwnerId) return { allow: false, reason: "recurso de outro dono" };
  if (req.stepToolCalls >= profile.maxToolCallsPerStep) return { allow: false, reason: "limite de chamadas por etapa" };
  if (TOOL_KIND[req.tool] === "write" && !INTERNAL_WRITES.has(req.tool)) {
    if (REQUIRES_APPROVAL.has(req.tool) && !req.approvalValid) return { allow: false, reason: "exige aprovação específica do conteúdo" };
  }
  return { allow: true };
}

function isToolName(t: string): t is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_KIND, t);
}
