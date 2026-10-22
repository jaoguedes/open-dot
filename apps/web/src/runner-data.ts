// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Dados do Runner para as telas do v0.3 (Runner, Aprovações, Workspace, Conexões). Real: rotas
 * autenticadas `/api/runner/*`. Demonstração: `DEMO_RUNNER` de demo.ts, sempre rotulada na tela.
 */
import { useEffect, useState } from "react";
import { sha256Utf8 } from "@open-dot/core/approval-view.ts";
import { DEMO_RUNNER } from "./demo.ts";

export type MechanismId = "codex" | "claude-code" | "cursor";
export interface RunnerDriver {
  id: MechanismId;
  installed: boolean;
  authenticated: boolean;
  executable: boolean;
  reason: string;
}
export interface RunnerDevice {
  id: string;
  name: string;
  online: boolean;
  revoked: boolean;
  compatible: boolean;
  compatibilityReason: string;
  projects: Array<{ id: string; label: string }>;
  drivers: RunnerDriver[];
}
export interface RunnerTask {
  id: string;
  deviceId: string;
  projectId: string;
  mechanism: MechanismId;
  state: string;
  cancelRequested: number;
  updatedAt: number;
}
export interface RunnerApproval {
  raw: string;
  hash: string;
  decision: "pending" | "approve" | "reject" | "expired";
  expiresAt: number;
}
export interface RunnerEvent {
  seq: number;
  kind: string;
  text: string;
  at?: number;
}
export interface TaskDetail {
  events: RunnerEvent[];
  approval: RunnerApproval | null;
}

export const STATE_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em execução",
  awaiting_approval: "Esperando sua aprovação",
  completed: "Concluída no worktree",
  failed: "Falhou",
  cancelled: "Cancelada",
  cancel_requested: "Aguardando confirmação de parada",
  uncertain: "Efeitos incertos · revisão necessária",
};

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`/api/runner/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { "x-open-dot": "1", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : "Runner indisponível. Confira sua sessão e a versão do servidor.");
  return data as T;
}

export interface RunnerState {
  status: "carregando" | "pronto" | "erro" | "offline";
  devices: RunnerDevice[];
  tasks: RunnerTask[];
  details: Record<string, TaskDetail>;
  error: string;
  refresh: () => void;
}

/**
 * Lê dispositivos, tarefas e o detalhe das últimas tarefas (eventos e aprovação). Pausa com a aba
 * oculta (G2) e recua quando nada muda: 5 s, depois 10 s, até 30 s.
 */
export function useRunner(demo: boolean, opts: { detailFor?: number } = {}): RunnerState {
  const [state, setState] = useState<Omit<RunnerState, "refresh">>({ status: "carregando", devices: [], tasks: [], details: {}, error: "" });
  const [rev, setRev] = useState(0);
  const want = opts.detailFor ?? 12;
  useEffect(() => {
    if (demo) {
      // Na demonstração o hash é o SHA-256 real do texto de exemplo, calculado aqui.
      let alive = true;
      void Promise.all(
        Object.entries(DEMO_RUNNER.details as Record<string, TaskDetail>).map(async ([id, d]) => [id, d.approval ? { ...d, approval: { ...d.approval, hash: await sha256Utf8(d.approval.raw) } } : d] as const),
      ).then((entries) => {
        if (alive) setState({ status: "pronto", devices: DEMO_RUNNER.devices as RunnerDevice[], tasks: DEMO_RUNNER.tasks as RunnerTask[], details: Object.fromEntries(entries), error: "" });
      });
      return () => {
        alive = false;
      };
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let delay = 5000;
    let last = "";
    async function load() {
      if (document.hidden) {
        timer = setTimeout(() => void load(), 15_000);
        return;
      }
      try {
        const d = await request<{ devices: RunnerDevice[] }>("devices", undefined, controller.signal);
        const t = await request<{ tasks: RunnerTask[] }>("tasks", undefined, controller.signal);
        const details: Record<string, TaskDetail> = {};
        for (const task of t.tasks.slice(0, want)) {
          const e = await request<{ events: RunnerEvent[]; approval?: RunnerApproval | null }>(`tasks/${encodeURIComponent(task.id)}/events`, undefined, controller.signal);
          details[task.id] = { events: e.events, approval: e.approval ?? null };
        }
        if (controller.signal.aborted) return;
        const fingerprint = JSON.stringify([d.devices.map((x) => [x.id, x.online]), t.tasks.map((x) => [x.id, x.state, x.updatedAt])]);
        delay = fingerprint === last ? Math.min(30_000, delay * 2) : 5000;
        last = fingerprint;
        setState({ status: "pronto", devices: d.devices, tasks: t.tasks, details, error: "" });
      } catch (e) {
        if (controller.signal.aborted) return;
        setState((old) => ({ ...old, status: navigator.onLine === false ? "offline" : "erro", devices: old.devices.map((x) => ({ ...x, online: false })), error: e instanceof Error ? e.message : "Sem resposta do servidor." }));
        delay = Math.min(30_000, delay * 2);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void load(), delay);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [demo, rev, want]);
  return { ...state, refresh: () => setRev((r) => r + 1) };
}

export async function decide(taskId: string, hash: string, decision: "approve" | "reject"): Promise<void> {
  await request(`tasks/${encodeURIComponent(taskId)}/decision`, { hash, decision });
}

/** Nome do projeto pelo id, sem caminho (o caminho nunca sai do Runner). */
export function projectLabel(devices: RunnerDevice[], projectId: string): string {
  return devices.flatMap((d) => d.projects).find((p) => p.id === projectId)?.label ?? "Projeto autorizado";
}
