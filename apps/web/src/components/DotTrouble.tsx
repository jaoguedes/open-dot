import { ownerTimeZone } from "../format.ts";
import { useEffect, useRef } from "react";
import { explainError, sanitizeDetail, type AgentId } from "@open-dot/core";
import { AgentDot } from "../dot/AgentDot.tsx";
import { toVisual } from "@open-dot/core";

export interface TroubleInfo {
  code: string;
  route?: string;
  detail?: string;
}

export async function clearAppCache(): Promise<void> {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

export function chunkPlan(alreadyReloaded: boolean): "reload" | "show" {
  return alreadyReloaded ? "show" : "reload";
}

export function DotTrouble({
  info,
  agentId = "dot",
  reducedMotion,
  onRetry,
  onDismiss,
}: {
  info: TroubleInfo;
  agentId?: AgentId;
  reducedMotion: boolean;
  onRetry?: () => void;
  /** "Dispensar": some até a próxima execução do mesmo agente (A2). */
  onDismiss?: () => void;
}) {
  const explained = explainError(info.code);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus();
  }, [info.code]);
  const when = new Date().toLocaleString("pt-BR", { timeZone: ownerTimeZone() });
  const loaded = document.querySelector('meta[name="open-dot-build"]')?.getAttribute("content") ?? "desconhecida";
  const technical = sanitizeDetail([explained.code, info.route ?? location.pathname, when, `app ${loaded}`, info.detail ?? ""].filter(Boolean).join(" · "));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(technical);
    } catch {
      /* sem clipboard: o texto continua na tela */
    }
  };
  return (
    <section className="card dot-trouble stack-10 my-16" role="alert">
      <AgentDot visual={toVisual(agentId, "error", null, explained.code)} accessory="none" size={72} reducedMotion={reducedMotion} />
      <p className="m-0">{explained.frase}</p>
      <p className="mono m-0">{explained.code}</p>
      <p className="meta m-0">{explained.acao}</p>
      <div className="row-actions">
        <button ref={primary} className="btn primary" type="button" onClick={() => (onRetry ? onRetry() : location.reload())}>
          Tentar de novo
        </button>
        <button className="btn" type="button" onClick={() => location.reload()}>
          Recarregar
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            void clearAppCache().then(() => location.reload());
          }}
        >
          Limpar cache e recarregar
        </button>
        <button className="btn ghost" type="button" onClick={() => void copy()}>
          Copiar detalhes
        </button>
        {onDismiss && (
          <button className="btn ghost" type="button" onClick={onDismiss}>
            Dispensar
          </button>
        )}
      </div>
      <details>
        <summary>Detalhes técnicos</summary>
        <p className="mono">{technical}</p>
      </details>
    </section>
  );
}
