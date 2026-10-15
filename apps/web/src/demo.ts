import { providerCards, toVisual, type AgentId } from "@open-dot/core";
import { emptyShipments, type AskAnswer, type Snapshot } from "./api.ts";
import { semanticFromItems } from "./presence.ts";

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

const DEMO_AGENTS: AgentId[] = ["dot", "correio", "codigo", "sentinela", "noticias", "mercado", "marketing"];

export function demoSnapshot(): Snapshot {
  const monitors: Snapshot["monitors"] = [
    { id: "m1", url: "https://exemplo.com", label: "exemplo.com", enabled: true, incident: { open: true, kind: "slow" }, lastCheckAt: at(7, 58) },
    { id: "m2", url: "https://loja.exemplo.com", label: "loja.exemplo.com", enabled: true, incident: { open: false }, lastCheckAt: at(7, 58) },
    { id: "m3", url: "https://docs.exemplo.com", label: "docs.exemplo.com", enabled: true, incident: { open: false }, lastCheckAt: at(7, 58) },
  ];
  const feed: Snapshot["feed"] = [
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
        abertura: "3 coisas pedem você.",
        itens: [
          { categoria: "prazo", titulo: "Prazo de rematrícula", quando: at(6, 40), o_que_aconteceu: "Há um prazo nesta mensagem.", o_que_fazer: "Veja a data no original.", origem: "e2", sensivel: false, de: "Faculdade" },
          { categoria: "resposta", titulo: "Você consegue revisar o documento?", quando: at(6, 5), o_que_aconteceu: "Ana fez uma pergunta.", o_que_fazer: "Responda se fizer sentido.", origem: "e3", sensivel: false, de: "Ana" },
          { categoria: "encomenda", titulo: "Confirme a entrega de amanhã", quando: at(7, 12), o_que_aconteceu: "Um código de rastreio chegou.", o_que_fazer: "Acompanhe em Entregas.", origem: "e1", sensivel: false, de: "Loja Exemplo" },
        ],
        sem_acao: ["e4"],
        ruido: { contagem: 1 },
        anexos: "Anexos não são lidos.",
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
    {
      id: "demo-news",
      agentId: "noticias",
      runId: null,
      kind: "news_digest",
      title: "O mundo hoje (exemplo fictício)",
      freshness: "fresh",
      createdAt: at(8, 5),
      coverage: { analyzed: 4, available: 4, syncedUntil: at(8), fieldsRead: ["título", "link", "veículo"], partial: false },
      body: {
        headline: "O mundo hoje",
        summary: "Exemplo fictício. Títulos de feeds públicos; o Dot não opina.",
        worldToday: [
          {
            theme: "tecnologia",
            items: [{ title: "Chip experimental reduz consumo (exemplo)", link: "https://example.com/tech", outlet: "BBC News", publishedAt: at(7) }],
          },
          {
            theme: "politica",
            items: [{ title: "Congresso discute orçamento (exemplo)", link: "https://example.com/pol", outlet: "NPR", publishedAt: at(6, 30) }],
          },
        ],
        politics: [
          {
            topic: "Congresso discute orçamento (exemplo)",
            eachSide: [
              { outlet: "BBC News", title: "Congresso discute orçamento (exemplo BBC)", link: "https://example.com/pol-bbc" },
              { outlet: "NPR", title: "Congresso discute orçamento (exemplo NPR)", link: "https://example.com/pol-npr" },
            ],
            notice: null,
          },
        ],
      },
    },
    {
      id: "demo-quote",
      agentId: "mercado",
      runId: null,
      kind: "quote_alert",
      title: "BTC passou do limite (exemplo fictício)",
      freshness: "stale",
      createdAt: at(8, 6),
      coverage: null,
      body: { summary: "Bitcoin variou 9,2% (fonte CoinGecko, exemplo). Só informativo, não é recomendação.", disclaimer: "Só informativo, não é recomendação" },
    },
    {
      id: "demo-mkt",
      agentId: "marketing",
      runId: null,
      kind: "marketing_ideas",
      title: "Ideias de post (rascunho, exemplo fictício)",
      freshness: "fresh",
      createdAt: at(8, 7),
      coverage: null,
      body: {
        summary: "Rascunho a partir da notícia de exemplo. Nada foi publicado.",
        published: false,
        drafts: [{ text: "Chip experimental reduz consumo — rascunho (exemplo fictício). Nada foi publicado.", sources: [{ title: "Chip experimental", link: "https://example.com/tech", outlet: "BBC News" }], status: "draft", publish: false }],
      },
    },
  ];
  return {
    owner: { email: "exemplo@demo.local", name: "João", timeZone: "America/Sao_Paulo" },
    configured: { database: false, google: false, owner: false, github: false, githubApp: false, vercel: false, ai: false, aiPrivate: false, finnhub: false, tracking: false, trackingState: "desligado" },
    connections: [],
    monitors,
    usage: { day: today.toISOString().slice(0, 10), calls: 12, tokens: 24_000, limits: { calls: 50, tokens: 100_000 }, aiConfigured: false, privateAllowed: false },
    routines: [{ id: "demo-rt", agentId: "correio", kind: "email_review", times: ["08:00", "17:00"], timeZone: "America/Sao_Paulo", weekdays: [], enabled: true, nextRunAt: at(17) }],
    runs: [{ id: "demo-run", agentId: "correio", kind: "email_review", state: "succeeded", scheduledAt: at(8), late: false, attempt: 1, errorCode: null, errorMessage: null, updatedAt: at(8, 2) }],
    status: DEMO_AGENTS.map((a) => ({ ...toVisual(a, semanticFromItems(a, feed, monitors)), revision: 1 })),
    agents: [
      {
        id: "noticias",
        name: "Notícias",
        description: "Exemplo fictício — feeds não foram buscados.",
        enabled: true,
        lastTestAt: null,
        lastError: null,
        sources: [
          { id: "ex-bbc", label: "BBC News · tecnologia (exemplo)", detail: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
          { id: "ex-npr", label: "NPR · tecnologia (exemplo)", detail: "https://feeds.npr.org/1019/rss.xml" },
        ],
        missing: ["Demonstração: nenhuma fonte real foi consultada."],
        note: "Exemplos fictícios. Só RSS/Atom da allowlist no modo ao vivo.",
      },
      {
        id: "mercado",
        name: "Mercado",
        description: "Exemplo fictício — sem cotação real.",
        enabled: true,
        lastTestAt: null,
        lastError: null,
        sources: [{ id: "BTC", label: "Bitcoin (BTC)", detail: "CoinGecko · exemplo" }],
        quotes: [],
        missing: ["Demonstração: sem cotação real. Nada é recomendação."],
        note: "Só informativo, não é recomendação",
      },
      {
        id: "marketing",
        name: "Marketing",
        description: "Exemplo fictício — Search Console e Vercel não conectados.",
        enabled: true,
        lastTestAt: null,
        lastError: null,
        sources: [],
        missing: ["Demonstração: Search Console e Vercel não conectados.", "Redes sociais: planejadas, sem implementar."],
        note: "Ideias de post são rascunho. Publicar nunca é automático.",
      },
    ],
    providers: providerCards({ groqConfigured: false, groqPrivate: false, calls: 12, callLimit: 50 }),
    canSend: false,
    shipments: emptyShipments,
    approvals: [
      {
        id: "demo-ap1",
        action: "gmail.send",
        payloadHash: "0".repeat(64),
        status: "pending",
        version: 1,
        expiresAt: at(23),
        createdAt: at(7, 12),
        proposal: {
          action: "gmail.send",
          service: "gmail",
          account: "exemplo@demo.local",
          resource: "thread:t1",
          payload: {
            to: "entregas@lojaexemplo.com.br",
            subject: "Re: Confirmação de entrega",
            body: "Olá! Confirmo a entrega para amanhã, quinta, no período da tarde. Alguém estará em casa a partir das 13h.\n\nObrigado,\nJoão",
          },
          consequence: "A loja pediu confirmação até 14h. Usei o horário da sua agenda de amanhã. Exemplo fictício.",
        },
      },
    ],
    feed,
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
