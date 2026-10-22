// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Correio e Notícias (v0.3), SÓ LEITURA. Remetente, assunto e trecho aparecem como texto; o
 * resumo é contagem (sem modelo). Notícias = newsletters e avisos em massa da sua própria caixa.
 * Nada aqui responde, encaminha, apaga, arquiva ou marca e-mail.
 */
import { useEffect, useMemo, useState } from "react";
import { FILTER_LABEL, MAIL_FILTERS, analysisPayload, daySummary, matches, payloadHash, plainText, senderLabel, type MailFilter, type MailRow } from "@open-dot/core/correio-view.ts";
import { useApp } from "../store.tsx";
import { DEMO_MAIL } from "../demo.ts";
import { DemoChip, MonoLabel } from "../components/ui.tsx";
import { toolState, useRunner } from "../runner-data.ts";
import { fmtTime } from "../format.ts";
import "../screens.css";

interface Payload {
  conectado: boolean;
  estado?: string;
  mensagens: MailRow[];
  resumo: ReturnType<typeof daySummary> | null;
}

export function Correio() {
  const app = useApp();
  const demo = app.mode === "demo";
  const [filtro, setFiltro] = useState<MailFilter>("todas");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const runner = useRunner(demo, { detailFor: 0 });
  const codexReady = toolState(runner.devices, "codex").pronto;
  useEffect(() => {
    if (demo) {
      const rows = DEMO_MAIL as unknown as MailRow[];
      setData({ conectado: true, mensagens: rows, resumo: daySummary(rows, new Date("2026-10-22T12:00:00Z")) });
      return;
    }
    const abort = new AbortController();
    fetch("/api/correio/mensagens", { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as Payload) : Promise.reject(new Error("falha"))))
      .then(setData, () => !abort.signal.aborted && setError("Não consegui ler o Correio agora. Os dados ficam onde estão; tente de novo."));
    return () => abort.abort();
  }, [demo]);
  const shown = useMemo(() => (data?.mensagens ?? []).filter((m) => matches(m, filtro)), [data, filtro]);
  const counts = data?.resumo?.porFiltro;
  return (
    <section className="screen correio-v3" aria-labelledby="correio-title">
      <header className="screen-head-v3">
        <MonoLabel>CORREIO E NOTÍCIAS</MonoLabel>
        {demo && <DemoChip />}
      </header>
      <h1 id="correio-title" className="title-v3">
        Correio e Notícias
      </h1>
      <p className="banner-ro" role="note">
        Acesso só de leitura: o Dot vê remetente, assunto e um trecho. Ele não responde nem encaminha e-mails.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Carregando o Correio…</p>}
      {data && !data.conectado && (
        <section className="card-v3 stack-10">
          <h2>Gmail não conectado</h2>
          <p className="meta">{data.estado === "reauth_required" ? "A permissão expirou. Reconecte para voltar a ler." : "Conecte o Gmail para ver o resumo do dia e as newsletters da sua caixa. A permissão pedida é só gmail.readonly."}</p>
          <button className="btn primary v3" type="button" onClick={() => app.navigate("/conexoes")}>
            {data.estado === "reauth_required" ? "Reconectar em Conexões" : "Conectar em Conexões (só leitura)"}
          </button>
        </section>
      )}
      {data?.conectado && (
        <>
          <section className="card-v3" aria-labelledby="resumo-dia">
            <h2 id="resumo-dia">Resumo do seu dia</h2>
            {data.resumo?.linhas.map((l) => (
              <p key={l} className="m-0">
                {l}
              </p>
            ))}
            <p className="tiny">Contagem feita por regras, sem modelo de IA. Notícias são as newsletters e avisos em massa que chegam na sua caixa.</p>
          </section>
          <div className="tabs-v3" role="tablist" aria-label="Filtrar mensagens">
            {MAIL_FILTERS.map((f) => (
              <button key={f} role="tab" type="button" aria-selected={filtro === f} className="chip-v3" onClick={() => setFiltro(f)}>
                {FILTER_LABEL[f]} {counts ? counts[f] : ""}
              </button>
            ))}
          </div>
          {!shown.length && <p className="meta">Nada neste filtro nas mensagens guardadas.</p>}
          <ul className="mail-list" aria-label="Mensagens">
            {shown.map((m) => (
              <MailItem key={m.id} m={m} demo={demo} codexReady={codexReady} projects={runner.devices.flatMap((d) => d.projects)} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MailItem({ m, demo, codexReady, projects }: { m: MailRow; demo: boolean; codexReady: boolean; projects: Array<{ id: string; label: string }> }) {
  const [panel, setPanel] = useState<"memoria" | "analise" | null>(null);
  const [hash, setHash] = useState("");
  const [project, setProject] = useState("");
  const [msg, setMsg] = useState("");
  const payload = useMemo(() => analysisPayload(m), [m]);
  const memoryText = `E-mail de ${payload.remetente}: ${payload.assunto}. ${payload.trecho}`.slice(0, 600);
  useEffect(() => {
    void payloadHash(panel === "memoria" ? memoryText : payload).then(setHash);
  }, [panel, payload, memoryText]);
  async function saveMemory() {
    setMsg("");
    try {
      const base = `/api/projects/${encodeURIComponent(project)}/memory`;
      const opts = { credentials: "same-origin" as const, cache: "no-store" as const, headers: { "x-open-dot": "1", "content-type": "application/json" } };
      const policy = await (await fetch(`${base}/policy`, opts)).json();
      if (!policy.enabled) return setMsg("Este projeto ainda não tem memória consentida. Consinta em Runner → Projetos e execuções → Memória do projeto.");
      const current = await (await fetch(base, opts)).json();
      const prev = current.passport ?? { schemaVersion: 1, scope: "memory-only", projectId: project, revision: 0, memories: [], links: [] };
      const r = await fetch(base, {
        ...opts,
        method: "POST",
        body: JSON.stringify({
          expectedRevision: prev.revision,
          consentRevision: policy.revision,
          passport: { ...prev, revision: prev.revision + 1, memories: [...prev.memories, { id: crypto.randomUUID(), kind: "fact", provenance: "external-evidence", summary: memoryText, sourceRefs: [`gmail:${m.id}`], observedAt: new Date().toISOString(), commit: null }] },
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? "não confirmado");
      setMsg("Salvo na memória do projeto como evidência externa (não é instrução nem permissão).");
      setPanel(null);
    } catch (e) {
      setMsg(e instanceof Error ? `Não salvei: ${e.message}` : "Não salvei.");
    }
  }
  return (
    <li className="card-v3 mail-item">
      <div className="row-v3">
        <div className="grow">
          <b>{senderLabel(m.from)}</b>
          <div>{plainText(m.subject, 200) || "(sem assunto)"}</div>
          <div className="sub">{plainText(m.snippet, 300)}</div>
        </div>
        <time className="sub" dateTime={m.receivedAt}>
          {fmtTime(m.receivedAt)}
        </time>
      </div>
      <div className="row-actions">
        {m.href ? (
          <a className="btn v3" href={m.href} target="_blank" rel="noopener noreferrer">
            Abrir no Gmail
          </a>
        ) : (
          <span className="btn v3" aria-disabled="true" title="Demonstração: sem conta conectada">
            Abrir no Gmail
          </span>
        )}
        <button className="btn v3" type="button" aria-expanded={panel === "memoria"} onClick={() => setPanel(panel === "memoria" ? null : "memoria")}>
          Salvar na memória
        </button>
        {codexReady && (
          <button className="btn v3" type="button" aria-expanded={panel === "analise"} onClick={() => setPanel(panel === "analise" ? null : "analise")}>
            Pedir análise ao Codex
          </button>
        )}
      </div>
      {panel === "memoria" && (
        <div className="stack-10 mt-8">
          <p className="tiny">Vai para a memória do projeto escolhido exatamente este texto, marcado como evidência externa:</p>
          <pre className="diff-v3 notes">{memoryText}</pre>
          <label htmlFor={`proj-${m.id}`}>Projeto</label>
          <select id={`proj-${m.id}`} value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">{projects.length ? "Escolha um projeto" : "Nenhum projeto autorizado no Runner"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn primary v3" type="button" disabled={demo || !project} onClick={() => void saveMemory()}>
            Salvar este texto
          </button>
          {demo && <p className="tiny">Demonstração: nada é salvo.</p>}
        </div>
      )}
      {panel === "analise" && (
        <div className="stack-10 mt-8">
          <p className="tiny">Só isto iria para o Codex, no seu computador. A resposta voltaria como texto, sem nenhuma ação:</p>
          <pre className="diff-v3 notes">{JSON.stringify(payload, null, 2)}</pre>
          <p className="tiny">
            Hash do conteúdo exato: <span className="hash">{hash}</span>
          </p>
          <button className="btn v3" type="button" disabled aria-describedby={`an-${m.id}`}>
            Aprovar e enviar ao Codex
          </button>
          <p className="tiny" id={`an-${m.id}`}>
            Planejado: o Runner ainda não tem um modo de leitura fora de projeto para esta análise. Nada foi enviado.
          </p>
        </div>
      )}
      {msg && <p role="status">{msg}</p>}
    </li>
  );
}
