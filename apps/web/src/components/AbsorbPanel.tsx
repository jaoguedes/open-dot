import { useEffect, useReducer, useRef, useState } from "react";
import { initialAbsorption, reduceAbsorption, toVisual, type SemanticState } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { api, ApiError, sendUpload, type UploadView } from "../api.ts";
import type { ExtractMessage } from "../absorb/extract.worker.ts";
import { Dot2D } from "./Dot2D.tsx";

/**
 * Arraste ou escolha um arquivo para o Dot absorver. Fases reais (packages/core/src/absorption.ts):
 * o texto é extraído aqui no navegador (Web Worker), enviado, e só a resposta 201 mostra "recebido";
 * "organizado" só aparece quando o servidor devolve o job concluído.
 */

const ACCEPT = ".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown";
const POLL_MS = 1500;
const POLL_MAX = 40;

let worker: Worker | null = null;
let seq = 0;
function extractor(): Worker {
  worker ??= new Worker("/assets/extract-worker.js", { type: "module" });
  return worker;
}

type Local = { kind: "none" } | { kind: "extracting"; done: number; total: number | null };

export function AbsorbPanel() {
  const app = useApp();
  const [s, dispatch] = useReducer(reduceAbsorption, initialAbsorption);
  const [local, setLocal] = useState<Local>({ kind: "none" });
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<UploadView | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const live = app.mode === "live";

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (s.phase === "processing") app.announce("Arquivo recebido. Organizando.");
    else if (s.label) app.announce(s.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.label, s.phase]);

  const busy = local.kind === "extracting" || s.phase === "selected" || s.phase === "uploading" || s.phase === "received" || s.phase === "processing";

  async function absorb(file: File) {
    if (!live || busy) return;
    setResult(null);
    dispatch({ type: "select", fileName: file.name, bytes: file.size, mime: file.type });
    // A validação do reducer decide; repetimos aqui só para não extrair arquivo recusado.
    const pre = reduceAbsorption(initialAbsorption, { type: "select", fileName: file.name, bytes: file.size, mime: file.type });
    if (pre.phase === "failed") return;

    const ac = new AbortController();
    abort.current = ac;
    setLocal({ kind: "extracting", done: 0, total: null });
    const extracted = await new Promise<Extract<ExtractMessage, { type: "done" }>["result"]>((resolve) => {
      const w = extractor();
      const id = ++seq;
      const onMsg = (e: MessageEvent<ExtractMessage>) => {
        if (e.data.id !== id) return;
        if (e.data.type === "progress") setLocal({ kind: "extracting", done: e.data.done, total: e.data.total });
        else {
          w.removeEventListener("message", onMsg);
          resolve(e.data.result);
        }
      };
      w.addEventListener("message", onMsg);
      ac.signal.addEventListener("abort", () => {
        w.removeEventListener("message", onMsg);
        resolve({ ok: false, code: "failed", message: "cancelado" });
      });
      w.postMessage({ id, file });
    });
    setLocal({ kind: "none" });
    if (ac.signal.aborted) return;
    if (!extracted.ok) return dispatch({ type: "failed", reason: extracted.message });

    dispatch({ type: "upload_started" });
    let created: { id: string; runId: string };
    try {
      created = await sendUpload(
        { fileName: file.name, mime: file.type, fileBytes: extracted.fileBytes, fileSha256: extracted.fileSha256, text: extracted.text, textSha256: extracted.textSha256, pages: extracted.pages },
        (loaded, total) => dispatch({ type: "upload_progress", loaded, total }),
        ac.signal,
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "aborted") return;
      return dispatch({ type: "failed", reason: e instanceof ApiError ? e.message : "Falha no envio." });
    }
    dispatch({ type: "persisted", uploadId: created.id });
    dispatch({ type: "job_started", jobId: created.runId });

    let view: UploadView | null = null;
    try {
      view = await api.processUpload(created.id);
      for (let i = 0; i < POLL_MAX && view && (view.state === "received" || view.state === "processing"); i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (ac.signal.aborted) return;
        view = await api.upload(created.id);
      }
    } catch (e) {
      return dispatch({ type: "failed", reason: e instanceof ApiError ? e.message : "Recebido, mas não consegui acompanhar a organização. Ela continua no servidor." });
    }
    if (view?.state === "organized") {
      setResult(view);
      dispatch({ type: "job_succeeded", jobId: created.runId });
      void app.refresh();
    } else if (view?.state === "failed") {
      dispatch({ type: "failed", reason: view.error?.message ?? "Não consegui organizar o texto." });
    } else {
      dispatch({ type: "failed", reason: "Recebido; a organização ainda não terminou. Ela continua no servidor." });
    }
  }

  function cancel() {
    abort.current?.abort();
    setLocal({ kind: "none" });
    dispatch({ type: "cancel" });
  }

  const semantic: SemanticState | null =
    local.kind === "extracting" || s.phase === "uploading" ? "working" : s.phase === "received" || s.phase === "processing" ? "thinking" : s.phase === "organized" ? "success" : s.phase === "failed" ? "error" : null;
  const visual = semantic ? toVisual("dot", semantic, s.jobId, s.error) : app.visualFor("dot");
  const statusText =
    local.kind === "extracting"
      ? local.total
        ? `Lendo o texto no seu computador… página ${local.done} de ${local.total}`
        : "Lendo o texto no seu computador…"
      : s.phase === "uploading" && s.progress !== null
        ? `${s.label} — ${Math.round(s.progress * 100)}%`
        : s.phase === "processing"
          ? "Arquivo recebido e guardado cifrado. Organizando…"
          : s.label;

  return (
    <section
      className={`absorb ${over ? "over" : ""}`}
      aria-label="Absorver arquivo"
      data-absorb-phase={local.kind === "extracting" ? "extracting" : s.phase}
      onDragOver={(e) => {
        if (!live) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void absorb(f);
      }}
    >
      <Dot2D visual={visual} accessory="none" size={84} animate reducedMotion={app.reducedMotion} absorbing={local.kind === "extracting" || s.phase === "selected" || s.phase === "uploading"} label={`Dot — ${statusText || "pronto para absorver um arquivo"}`} />
      <div>
        <b>Dar um arquivo ao Dot</b>
        <p className="meta" style={{ margin: "2px 0 0" }}>
          {live ? "Arraste aqui um PDF com texto, TXT ou Markdown (até 5 MB). O texto é lido no seu computador; o arquivo original não é enviado." : "Indisponível na demonstração: absorver precisa do servidor real (npm run dev)."}
        </p>
        <div className="absorb-actions">
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" id="absorb-file" tabIndex={-1} disabled={!live || busy} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void absorb(f);
          }} />
          <button className="btn" type="button" disabled={!live || busy} onClick={() => input.current?.click()}>
            Escolher arquivo
          </button>
          {busy && s.phase !== "received" && s.phase !== "processing" && (
            <button className="btn" type="button" onClick={cancel}>
              Cancelar
            </button>
          )}
          <span role="status" aria-live="polite" className={`tiny ${s.phase === "failed" ? "err-text" : ""}`} data-testid="absorb-status">
            {statusText}
          </span>
        </div>
        {s.phase === "uploading" && <progress aria-label="Progresso do envio" {...(s.progress !== null ? { value: s.progress, max: 1 } : {})} />}
      </div>
      {result?.result && (
        <div className="absorb-result card" data-testid="absorb-result">
          <h3>{result.result.title}</h3>
          <p className="meta" style={{ margin: 0 }}>
            {result.result.words.toLocaleString("pt-BR")} palavras{result.result.pages ? ` · ${result.result.pages} páginas` : ""} · ~{result.result.readingMinutes} min de leitura · organizado por regras, sem IA
          </p>
          {result.result.headings.length > 0 && <p className="tiny" style={{ margin: "6px 0 0" }}>Seções: {result.result.headings.join(" · ")}</p>}
          {result.result.keywords.length > 0 && <p className="tiny" style={{ margin: "4px 0 0" }}>Termos frequentes: {result.result.keywords.join(", ")}</p>}
        </div>
      )}
    </section>
  );
}
