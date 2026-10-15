import { useState } from "react";
import { approvalQueue, queuePosition, toVisual } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { api, ApiError } from "../api.ts";
import { AgentDot } from "../dot/AgentDot.tsx";
import { Icon } from "../components/Icons.tsx";

/** Tela 03: uma aprovação por vez, hash + CAS. Gmail só leitura — não envia. */
export function Approval({ id }: { id: string }) {
  const app = useApp();
  const demo = app.mode === "demo";
  const item = (app.snap?.approvals ?? []).find((a) => a.id === id);
  const queue = approvalQueue(app.snap?.approvals ?? [], Date.now());
  const pos = queuePosition(queue, id);
  const nextId = pos?.next ?? queue.visible.find((a) => a.id !== id)?.id ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!item) {
    return (
      <div className="state">
        <h2>Nenhuma aprovação com este id.</h2>
        <p>Aprovações pendentes aparecem quando um agente pede o seu OK do texto exato.</p>
        <button className="btn" onClick={() => app.navigate("/meu-dia")}>
          Voltar ao meu dia
        </button>
      </div>
    );
  }

  const payload = item.proposal?.payload ?? {};
  const to = String(payload.to ?? payload.account ?? item.proposal?.account ?? "—");
  const subject = String(payload.subject ?? "—");
  const text = draft ?? String(payload.body ?? payload.text ?? "");
  const editing = draft !== null;
  const waiting = toVisual("correio", item.status === "pending" ? "waiting" : item.status === "approved" ? "success" : "idle");

  const decide = async (decision: "approve" | "reject") => {
    if (demo) {
      setMsg({
        ok: decision === "approve",
        text: decision === "approve" ? "Demonstração: Envio ainda não habilitado. Nada foi enviado." : "Demonstração: recusa fictícia. Nada mudou no servidor.",
      });
      return;
    }
    setBusy(true);
    try {
      const r = await api.decideApproval(item.id, { decision, expectedVersion: item.version, payloadHash: item.payloadHash });
      setMsg({
        ok: r.result === "ok",
        text: decision === "approve" ? (r.note ?? "Decisão registrada. Nada foi enviado.") : "Recusado. Nada foi enviado.",
      });
      await app.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Não consegui registrar a decisão." });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (demo) {
      setMsg({ ok: true, text: "Demonstração: editar geraria um hash novo e pediria aprovação de novo." });
      setDraft(null);
      return;
    }
    if (!item.proposal) return;
    setBusy(true);
    try {
      const proposal = { ...item.proposal, payload: { ...item.proposal.payload, body: text } };
      const r = await api.editApproval(item.id, { expectedVersion: item.version, proposal });
      setMsg({ ok: r.result === "ok", text: r.result === "ok" ? "Texto atualizado. A aprovação vale só para este texto novo — confirme de novo." : "Não deu para editar (versão mudou)." });
      setDraft(null);
      await app.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Não consegui editar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="approval">
      <header className="approval-head">
        <span className="mono aside-h">Aprovação · Correio</span>
        {pos && (
          <span className="chip" aria-label={`Aprovação ${pos.label}`}>
            {pos.label}
            {queue.more > 0 ? ` · mais ${queue.more}` : ""}
          </span>
        )}
      </header>

      <section className="approval-hero" aria-label="Pedido">
        <AgentDot visual={waiting} accessory={app.accessoryFor("correio")} size={120} reducedMotion={app.reducedMotion} />
        <div>
          <h1>Posso enviar esta resposta?</h1>
          <p className="serif approval-sub">
            nada sai sem o seu OK
          </p>
        </div>
      </section>

      <section className="approval-card" aria-label="Resposta">
        <dl>
          <dt>Para</dt>
          <dd>{to}</dd>
          <dt>Assunto</dt>
          <dd>{subject}</dd>
        </dl>
        {editing ? (
          <textarea value={text} onChange={(e) => setDraft(e.target.value)} rows={8} aria-label="Texto da resposta" />
        ) : (
          <div className="approval-body">{text}</div>
        )}
        <p className="approval-lock">
          <Icon name="alert" size={14} /> A aprovação vale só para este texto exato.
        </p>
      </section>

      <section className="approval-why" aria-label="Por que">
        <span className="aside-h">Por que eu sugeri</span>
        <p>{item.proposal?.consequence ?? "Sem justificativa gravada."}</p>
      </section>

      {msg && (
        <p role="status" className={`chip ws-normal ${msg.ok ? "ok" : "err"}`}>
          {msg.text}
        </p>
      )}
      {msg && item.status !== "pending" && nextId && (
        <button className="btn" type="button" onClick={() => (setMsg(null), setDraft(null), app.navigate(`/aprovacao/${encodeURIComponent(nextId)}`))}>
          Próxima aprovação
        </button>
      )}

      <div className="approval-actions">
        {editing ? (
          <>
            <button className="btn primary" disabled={busy} onClick={() => void saveEdit()}>
              Guardar e pedir de novo
            </button>
            <button className="btn" disabled={busy} onClick={() => setDraft(null)}>
              Cancelar edição
            </button>
          </>
        ) : (
          <>
            <button className="btn primary" disabled={busy || item.status !== "pending"} onClick={() => void decide("approve")}>
              {demo || !app.snap?.canSend ? "Aprovar e enviar" : "Aprovar e enviar"}
            </button>
            <div className="approval-split">
              <button className="btn" disabled={busy || item.status !== "pending"} onClick={() => setDraft(text)}>
                Editar
              </button>
              <button className="btn" disabled={busy || item.status !== "pending"} onClick={() => void decide("reject")}>
                Negar
              </button>
            </div>
            <p className="tiny">Envio ainda não habilitado. O Gmail continua só leitura — aprovar não envia.</p>
          </>
        )}
      </div>
    </div>
  );
}

