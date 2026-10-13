import { toVisual } from "@open-dot/core";
import type { AskAnswer, Snapshot } from "./api.ts";

/**
 * DADOS DE DEMONSTRAÇÃO — fictícios, isolados neste arquivo e sempre exibidos com
 * a faixa "Demonstração". Nunca mostram conta conectada, envio ou conclusão real.
 */

const today = new Date();
const at = (h: number, m = 0) => {
  const d = new Date(today);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export function demoSnapshot(): Snapshot {
  return {
    owner: { email: "exemplo@demo.local", name: "João", timeZone: "America/Sao_Paulo" },
    configured: { database: false, google: false, owner: false, github: false, githubApp: false, vercel: false, ai: false, aiPrivate: false },
    connections: [],
    monitors: [],
    usage: { day: today.toISOString().slice(0, 10), calls: 12, tokens: 24_000, limits: { calls: 50, tokens: 100_000 }, aiConfigured: false, privateAllowed: false },
    routines: [{ id: "demo-rt", agentId: "correio", kind: "email_review", times: ["08:00", "17:00"], timeZone: "America/Sao_Paulo", weekdays: [], enabled: true, nextRunAt: at(17) }],
    runs: [{ id: "demo-run", agentId: "correio", kind: "email_review", state: "succeeded", scheduledAt: at(8), late: false, attempt: 1, errorCode: null, errorMessage: null, updatedAt: at(8, 2) }],
    status: [
      { ...toVisual("dot", "idle"), revision: 1 },
      { ...toVisual("correio", "success"), revision: 1 },
      { ...toVisual("codigo", "idle"), revision: 1 },
      { ...toVisual("sentinela", "idle"), revision: 1 },
    ],
    feed: [
      {
        id: "demo-1",
        agentId: "correio",
        runId: "demo-run",
        kind: "email_digest",
        title: "Sua revisão das 08h",
        freshness: "fresh",
        createdAt: at(8, 2),
        coverage: { analyzed: 20, available: 20, syncedUntil: at(7, 59), fieldsRead: ["remetente", "assunto", "trecho curto do provedor", "rótulos"], partial: false },
        body: {
          headline: "20 mensagens analisadas • 3 precisam de atenção",
          counts: { important: 3, review: 2, low: 15 },
          total: 20,
          aiUsed: false,
          aiNote: "Exemplo classificado por regras.",
          top: [
            { messageId: "e1", threadId: "t1", from: "Loja Exemplo <pedidos@exemplo.com>", subject: "Confirme a entrega de amanhã", reason: "Pede confirmação até amanhã às 14h.", receivedAt: at(7, 12), category: "important", href: "#exemplo" },
            { messageId: "e2", threadId: "t2", from: "Faculdade <secretaria@exemplo.edu>", subject: "Prazo de rematrícula", reason: "Menciona “prazo”.", receivedAt: at(6, 40), category: "important", href: "#exemplo" },
            { messageId: "e3", threadId: "t3", from: "Ana <ana@exemplo.com>", subject: "Você consegue revisar o documento?", reason: "Mensagem direta com pergunta para você.", receivedAt: at(6, 5), category: "important", href: "#exemplo" },
          ],
          rest: [
            { messageId: "e4", threadId: "t4", from: "Banco <aviso@exemplo.com>", subject: "Extrato disponível", reason: "Aviso automático sem pedido de ação.", receivedAt: at(5), category: "low", href: "#exemplo" },
            { messageId: "e5", threadId: "t5", from: "Newsletter <news@exemplo.com>", subject: "Novidades da semana", reason: "Lista, newsletter ou promoção.", receivedAt: at(4), category: "low", href: "#exemplo" },
          ],
        },
      },
      {
        id: "demo-2",
        agentId: "sentinela",
        runId: null,
        kind: "site_incident",
        title: "Seu site respondeu mais devagar",
        freshness: "fresh",
        createdAt: at(7, 40),
        coverage: null,
        body: { summary: "Três verificações acima de 1,5 s. Ainda sem diagnóstico de causa.", correlation: "Houve um deploy 12 min antes (a1b2c3d). Ainda não há evidência de que seja a causa." },
      },
      {
        id: "demo-3",
        agentId: "codigo",
        runId: null,
        kind: "ci_failure",
        title: "Workflow falhou em exemplo/app",
        freshness: "fresh",
        createdAt: at(7, 20),
        coverage: null,
        body: { summary: "CI terminou com falha no commit a1b2c3d. Os logs não foram baixados automaticamente." },
      },
    ],
  };
}

/** Busca local nos dados de exemplo — mesma regra do servidor: só responde com fontes. */
export function demoAsk(question: string, snap: Snapshot): AskAnswer {
  const words = question.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\W+/).filter((w) => w.length >= 3);
  const sources: AskAnswer["sources"] = [];
  for (const item of snap.feed) {
    for (const m of [...(item.body.top ?? []), ...(item.body.rest ?? [])]) {
      const hay = `${m.subject} ${m.from} ${m.reason}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (words.some((w) => hay.includes(w))) sources.push({ id: m.messageId, title: `${m.subject} — ${m.from}`, detail: m.reason, href: null, at: m.receivedAt });
    }
  }
  return sources.length
    ? { answer: `Encontrei ${sources.length} ${sources.length === 1 ? "item" : "itens"} nos dados de exemplo.`, sources: sources.slice(0, 5), aiUsed: false, note: "Demonstração: busca local, sem IA." }
    : { answer: "Não encontrei nada sobre isso nos dados de exemplo.", sources: [], aiUsed: false, note: "Demonstração: busca local, sem IA." };
}
