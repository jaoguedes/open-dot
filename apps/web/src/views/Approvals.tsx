// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Aprovações (v0.3): propostas de arquivos do Runner. O hash no rodapé é o SHA-256 recalculado do
 * texto exato mostrado; Aprovar só habilita quando bate com o guardado pelo servidor. Rejeitar fica
 * sempre disponível enquanto a proposta está pendente.
 */
import { useEffect, useMemo, useState } from "react";
import { approvable, fileDiffs, parseProposal, totals, type ApprovableState } from "@open-dot/core/approval-view.ts";
import { useApp } from "../store.tsx";
import { decide, projectLabel, STATE_LABEL, useRunner, type RunnerTask, type TaskDetail } from "../runner-data.ts";
import { AgentDisc, DemoChip, MonoLabel, agentName } from "../components/ui.tsx";
import { fmtDateTime } from "../format.ts";
import "../screens.css";

type Tab = "pendentes" | "aprovadas" | "rejeitadas" | "todas";
const TABS: Array<[Tab, string]> = [
  ["pendentes", "Pendentes"],
  ["aprovadas", "Aprovadas"],
  ["rejeitadas", "Rejeitadas"],
  ["todas", "Todas"],
];

function decisionOf(d: TaskDetail | undefined): "pending" | "approve" | "reject" | "expired" | null {
  if (!d?.approval) return null;
  if (d.approval.decision === "pending" && d.approval.expiresAt <= Date.now()) return "expired";
  return d.approval.decision;
}

export function Approvals() {
  const app = useApp();
  const demo = app.mode === "demo";
  const runner = useRunner(demo, { detailFor: 20 });
  const [tab, setTab] = useState<Tab>("pendentes");
  const wanted = new URLSearchParams(location.search).get("tarefa");
  const [selected, setSelected] = useState<string | null>(wanted);
  const withApproval = runner.tasks.filter((t) => runner.details[t.id]?.approval);
  const counts = {
    pendentes: withApproval.filter((t) => decisionOf(runner.details[t.id]) === "pending").length,
    aprovadas: withApproval.filter((t) => decisionOf(runner.details[t.id]) === "approve").length,
    rejeitadas: withApproval.filter((t) => decisionOf(runner.details[t.id]) === "reject").length,
    todas: withApproval.length,
  };
  const list = withApproval.filter((t) => {
    const d = decisionOf(runner.details[t.id]);
    return tab === "todas" || (tab === "pendentes" && d === "pending") || (tab === "aprovadas" && d === "approve") || (tab === "rejeitadas" && d === "reject");
  });
  const current = list.find((t) => t.id === selected) ?? list[0] ?? null;
  return (
    <section className="screen approvals-v3" aria-labelledby="ap-title">
      <header className="screen-head-v3">
        <MonoLabel>APROVAÇÕES</MonoLabel>
        {demo && <DemoChip />}
      </header>
      <h1 id="ap-title" className="title-v3">
        Revise antes de qualquer arquivo mudar
      </h1>
      <p className="meta">Cada aprovação vale para o conteúdo exato mostrado, uma vez, no worktree isolado da tarefa. Nada é publicado, enviado ou commitado por aqui.</p>
      <div className="tabs-v3" role="tablist" aria-label="Filtrar aprovações">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} className="chip-v3" onClick={() => setTab(id)}>
            {label} {counts[id]}
          </button>
        ))}
      </div>
      {runner.status === "carregando" && <p role="status">Carregando propostas…</p>}
      {runner.status === "erro" && (
        <p role="alert">
          Não consegui carregar as propostas: {runner.error}{" "}
          <button className="btn ghost" type="button" onClick={runner.refresh}>
            Tentar de novo
          </button>
        </p>
      )}
      {runner.status === "offline" && <p role="status">Você está offline. Mostrando o que já tinha sido carregado.</p>}
      {runner.status === "pronto" && !list.length && <p className="meta">{tab === "pendentes" ? "Nada esperando você. Quando o Runner propuser arquivos, eles aparecem aqui." : "Nenhuma proposta nesta aba."}</p>}
      {!!list.length && (
        <div className="approvals-grid">
          <ul className="card-v3 approvals-list" aria-label="Propostas">
            {list.map((t) => (
              <ApprovalRow key={t.id} task={t} detail={runner.details[t.id]!} label={projectLabel(runner.devices, t.projectId)} on={current?.id === t.id} onSelect={() => setSelected(t.id)} />
            ))}
          </ul>
          {current && <ApprovalDetail key={current.id} task={current} detail={runner.details[current.id]!} demo={demo} online={runner.devices.some((d) => d.id === current.deviceId && d.online)} label={projectLabel(runner.devices, current.projectId)} onDone={runner.refresh} />}
        </div>
      )}
    </section>
  );
}

function ApprovalRow({ task, detail, label, on, onSelect }: { task: RunnerTask; detail: TaskDetail; label: string; on: boolean; onSelect: () => void }) {
  const p = parseProposal(detail.approval!.raw);
  const t = p ? totals(fileDiffs(p)) : null;
  return (
    <li>
      <button type="button" className="row-v3 approval-row" aria-current={on ? "true" : undefined} onClick={onSelect}>
        <AgentDisc id={task.mechanism} size={36} />
        <span className="grow">
          <b>{p?.summary.slice(0, 80) ?? "Proposta em formato desconhecido"}</b>
          <span className="sub">
            {agentName(task.mechanism)} · {label} · branch <code>agent/{task.id.slice(0, 8)}</code>
          </span>
          {t && (
            <span className="sub">
              {t.arquivos} {t.arquivos === 1 ? "arquivo" : "arquivos"} · <span className="plus">+{t.adicionadas}</span> <span className="minus">−{t.removidas}</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ApprovalDetail({ task, detail, demo, online, label, onDone }: { task: RunnerTask; detail: TaskDetail; demo: boolean; online: boolean; label: string; onDone: () => void }) {
  const a = detail.approval!;
  const decision = decisionOf(detail);
  const [check, setCheck] = useState<ApprovableState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [receipt, setReceipt] = useState<{ decision: string; hash: string; at: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void approvable(a.raw, a.hash, { pending: decision === "pending", expired: decision === "expired", runnerOnline: online }).then((s) => alive && setCheck(s));
    return () => {
      alive = false;
    };
  }, [a.raw, a.hash, decision, online]);
  const proposal = useMemo(() => parseProposal(a.raw), [a.raw]);
  const diffs = useMemo(() => (proposal ? fileDiffs(proposal) : []), [proposal]);
  const blocked = demo ? "Demonstração: aprovar e rejeitar estão desligados." : (check?.motivo ?? "Conferindo o hash do conteúdo…");
  async function act(kind: "approve" | "reject") {
    setBusy(true);
    setMsg("");
    try {
      await decide(task.id, a.hash, kind);
      setReceipt({ decision: kind === "approve" ? "Aprovada" : "Rejeitada", hash: a.hash, at: new Date().toLocaleString("pt-BR") });
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Decisão não confirmada pelo servidor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card-v3 approval-detail" aria-labelledby={`ap-${task.id}`}>
      <h2 id={`ap-${task.id}`}>{proposal?.summary ?? "Proposta em formato desconhecido"}</h2>
      <p className="sub">
        {agentName(task.mechanism)} · {label} · {STATE_LABEL[task.state] ?? task.state}
      </p>
      <h3>Arquivos alterados</h3>
      <ul className="files-v3">
        {diffs.map((d) => (
          <li key={d.path}>
            <code>{d.path}</code> · {d.novo ? "novo" : d.anteriorDesconhecido ? "substituição (conteúdo anterior não enviado)" : "alterado"} · <span className="plus">+{d.adicionadas}</span> <span className="minus">−{d.removidas}</span>
          </li>
        ))}
      </ul>
      {diffs.map((d) => (
        <details key={d.path} open={diffs.length <= 2}>
          <summary>Diff de {d.path}</summary>
          <pre className="diff-v3" aria-label={`Diff de ${d.path}`}>
            {d.linhas.map((l, i) => (
              <span key={i} className={l.kind === "+" ? "plus" : l.kind === "-" ? "minus" : undefined}>
                {l.kind} {l.text}
                {"\n"}
              </span>
            ))}
          </pre>
        </details>
      ))}
      {!proposal && <pre className="diff-v3">{a.raw}</pre>}
      <h3>Linha do tempo</h3>
      <ol className="timeline-v3">
        {detail.events.map((e) => (
          <li key={e.seq}>
            <b>{e.kind}</b>
            {e.at ? ` · ${fmtDateTime(new Date(e.at).toISOString())}` : ""} — {e.kind === "proposal" ? "proposta recebida" : e.text.slice(0, 200)}
          </li>
        ))}
      </ol>
      {receipt && (
        <p role="status" className="receipt-v3">
          Recibo: {receipt.decision} em {receipt.at} · hash <span className="hash">{receipt.hash}</span>
        </p>
      )}
      {msg && <p role="alert">{msg}</p>}
      <footer className="approval-foot">
        <p className="tiny">
          Aprovação vinculada ao conteúdo exato · hash <span className="hash" data-testid="approval-hash">{check?.hashExibido ?? "calculando…"}</span>
          {check && !check.hashConfere && " (diferente do guardado: não aprove)"}
        </p>
        {decision === "pending" ? (
          <div className="row-actions">
            <button className="btn danger v3" type="button" disabled={demo || busy} onClick={() => void act("reject")}>
              Rejeitar
            </button>
            <button className="btn approve v3" type="button" disabled={demo || busy || !check?.podeAprovar} aria-describedby={`why-${task.id}`} onClick={() => void act("approve")}>
              Aprovar estes arquivos
            </button>
          </div>
        ) : (
          <p role="status">{decision === "approve" ? "Aprovada." : decision === "reject" ? "Rejeitada." : "Expirada."}</p>
        )}
        {decision === "pending" && (demo || !check?.podeAprovar) && (
          <p className="tiny" id={`why-${task.id}`}>
            {blocked}
          </p>
        )}
      </footer>
    </article>
  );
}
