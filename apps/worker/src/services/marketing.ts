import { MARKETING_CAN_PUBLISH, draftPostIdeas } from "@open-dot/core";
import { listGscSites } from "@open-dot/connectors/gsc.ts";
import { webAnalyticsHint } from "@open-dot/connectors/vercel.ts";
import type { Ctx } from "../context.ts";
import * as repo from "../repo.ts";
import { scrubSecrets } from "../reasons.ts";
import { ConnectorError } from "@open-dot/connectors/errors.ts";
import { listRecentNews } from "./news.ts";

/** Teste do Marketing: rascunhos + leitura. Nunca publica. */
export async function testMarketing(
  ctx: Ctx,
  ownerId: string,
  fetchImpl: typeof fetch,
): Promise<{ drafts: number; sites: string[]; missing: string[]; published: false; note: string }> {
  if (MARKETING_CAN_PUBLISH) throw new Error("incapacidade de publicar violada");
  const settings = await repo.agentSettings(ctx.db, ownerId, "marketing");
  if (settings && settings.enabled === 0) {
    return { drafts: 0, sites: [], missing: ["Marketing desativado."], published: false, note: "Desativado." };
  }

  const missing: string[] = [];
  const news = await listRecentNews(ctx.db, ownerId, 12);
  const drafts = draftPostIdeas(news);
  const conns = await repo.listConnections(ctx.db, ownerId);
  const gsc = conns.find((c) => c.provider === "gsc" && c.status === "connected");
  const sites: string[] = [];

  if (gsc) {
    try {
      const tokens = await repo.readSecret(ctx.db, ctx.keys, ownerId, gsc.id);
      if (!tokens?.accessToken) missing.push("Search Console conectado, mas o token não pôde ser lido. Reconecte.");
      else {
        const listed = await listGscSites(fetchImpl, tokens.accessToken, ctx.now());
        sites.push(...listed.map((s) => s.siteUrl));
      }
    } catch (e) {
      missing.push(e instanceof ConnectorError ? scrubSecrets(e.message) : "Falha ao listar sites do Search Console.");
    }
  } else {
    missing.push("Falta conectar o Google Search Console (só leitura, webmasters.readonly).");
  }

  if (ctx.env.VERCEL_TOKEN && ctx.env.VERCEL_PROJECT_ID) {
    const hint = await webAnalyticsHint(fetchImpl, {
      token: ctx.env.VERCEL_TOKEN,
      projectId: ctx.env.VERCEL_PROJECT_ID,
      ...(ctx.env.VERCEL_TEAM_ID ? { teamId: ctx.env.VERCEL_TEAM_ID } : {}),
    });
    missing.push(hint.note);
  } else {
    missing.push("Falta token da Vercel no setup:cloud para deployments (visitas só se Web Analytics Hobby estiver ativo).");
  }

  missing.push("Redes sociais: planejadas, sem implementar.");

  if (drafts.length) {
    await repo.insertFeed(ctx.db, ctx.keys, {
      ownerId,
      agentId: "marketing",
      runId: null,
      kind: "marketing_ideas",
      title: "Ideias de post (rascunho)",
      body: {
        summary: `${drafts.length} rascunho(s) a partir das notícias do dia. Nada foi publicado. Publicar exigiria aprovação vinculada ao texto exato.`,
        drafts: drafts.map((d) => ({ text: d.text, sources: d.sources, status: d.status, publish: false })),
        published: false,
      },
      freshness: "fresh",
      coverage: { analyzed: news.length, available: news.length, syncedUntil: new Date(ctx.now()).toISOString(), fieldsRead: ["título", "link", "veículo"], partial: false },
      now: ctx.now(),
    });
  }

  await repo.touchAgentSettings(ctx.db, ownerId, "marketing", {
    lastTestAt: new Date(ctx.now()).toISOString(),
    lastError: missing.length ? missing.join(" ") : null,
    now: ctx.now(),
  });

  return {
    drafts: drafts.length,
    sites,
    missing,
    published: false,
    note: "Marketing não publica.",
  };
}

