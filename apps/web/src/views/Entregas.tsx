// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { AGENTS, PACOTEVICIO_ATTRIBUTION } from "@open-dot/core";
import { ApiError, api, type ShipmentSnapshot, type ShipmentView } from "../api.ts";
import { useApp } from "../store.tsx";
import { fmtTime } from "../format.ts";

const ERROR_PT: Record<string, string> = {
  chave_recusada: "A chave do PacoteVício foi recusada. O rastreio automático pausou.",
  limite: "O PacoteVício limitou as consultas agora.",
  nao_encontrado: "A transportadora ainda não reconhece este código.",
  fora_da_cobertura: "Esta transportadora não entra na consulta automática.",
  tempo_esgotado: "A consulta demorou demais. Tento de novo mais tarde.",
  indisponivel: "A consulta automática está indisponível agora.",
};

/** Entregas: lista, inclusão manual e página pública da transportadora. */
export function Entregas() {
  const app = useApp();
  const snap = app.snap?.shipments;
  const [code, setCode] = useState("");
  const [carrier, setCarrier] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (app.mode === "demo") {
    return (
      <div className="state">
        <h1>{AGENTS.entregas.name}</h1>
        <p>Na demonstração não há encomenda real. O agente aparece como não conectado.</p>
      </div>
    );
  }
  if (!snap) return <p role="status">Carregando encomendas…</p>;

  async function apply(next: ShipmentSnapshot, message: string) {
    setNote(message);
    app.announce(message);
    await app.refresh();
    return next;
  }

  return (
    <>
      <h1>{AGENTS.entregas.name}</h1>
      <p className="meta">{AGENTS.entregas.description}</p>
      {!snap.tracking.enabled && (
        <p className="state" role="status">
          {snap.tracking.reason || "Rastreio automático desligado. Você ainda pode guardar o código e abrir o site da transportadora."}
        </p>
      )}
      {snap.tracking.paused && (
        <p className="banner" role="status">
          Parei nas {snap.tracking.stop} consultas deste mês para não passar das {snap.tracking.limit} do plano gratuito.
        </p>
      )}

      <form
        className="card"
        style={{ margin: "16px 0", display: "grid", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          const chosen = pendingId ? carrier : undefined;
          const run = pendingId
            ? api.confirmShipmentCarrier(pendingId, carrier).then(async (next) => {
                setPendingId(null);
                setCarrier("");
                setCode("");
                await apply(next, "Transportadora confirmada.");
              })
            : api.addShipment(code, chosen).then(async (next) => {
                const row = next.shipments.find((s) => s.code.replace(/[\s-]/g, "").toUpperCase() === code.replace(/[\s-]/g, "").toUpperCase());
                if (row?.needsCarrier) {
                  setPendingId(row.id);
                  setNote("Não deu para ter certeza da transportadora. Escolha uma e confirme.");
                } else {
                  setCode("");
                  setNote(next.created ? "Encomenda salva. Nada foi comprado nem alterado." : "Esse código já estava na lista.");
                }
                await app.refresh();
              });
          void run.catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Não consegui salvar a encomenda.")).finally(() => setBusy(false));
        }}
      >
        <label htmlFor="track-code">Monitorar encomenda</label>
        <input id="track-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Cole o código de rastreio" autoComplete="off" disabled={Boolean(pendingId)} />
        {(pendingId || carrier) && (
          <label>
            Transportadora
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} required>
              <option value="">Escolher…</option>
              {snap.carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row-actions">
          <button className="btn primary" type="submit" disabled={busy || code.trim().length < 8 || (Boolean(pendingId) && !carrier)}>
            {pendingId ? "Confirmar transportadora" : "Monitorar encomenda"}
          </button>
        </div>
        {note && (
          <p className="meta" role="status">
            {note}
          </p>
        )}
        {error && (
          <p className="banner err" role="alert">
            {error}
          </p>
        )}
      </form>

      {snap.shipments.length === 0 ? (
        <div className="state">
          <h2>Nenhuma encomenda monitorada.</h2>
          <p>Cole um código ou deixe o Correio encontrar um no assunto e no trecho dos e-mails já lidos. Entrada por print fica para depois.</p>
        </div>
      ) : (
        <ul className="list" aria-label="Encomendas">
          {snap.shipments.map((s) => (
            <ShipmentRow key={s.id} row={s} onChanged={(msg) => void app.refresh().then(() => app.announce(msg))} onError={setError} />
          ))}
        </ul>
      )}
    </>
  );
}

function ShipmentRow({ row, onChanged, onError }: { row: ShipmentView; onChanged: (msg: string) => void; onError: (msg: string) => void }) {
  const hint = row.lastError ? (ERROR_PT[row.lastError] ?? "Não consegui atualizar esta encomenda.") : null;
  return (
    <li className="card" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      <strong>{row.storeLabel || "Encomenda"}</strong>
      <span className="mono">{row.code}</span>
      <span>
        {row.carrierLabel ?? "Transportadora a confirmar"} · {row.statusLabel ?? "Sem atualização"}
      </span>
      {row.lastEvent && (
        <span className="meta">
          {row.lastEvent}
          {row.lastEventAt ? ` · ${fmtTime(row.lastEventAt)}` : ""}
        </span>
      )}
      {hint && <span className="meta">{hint}</span>}
      <div className="row-actions">
        {row.page && (
          <a className="btn" href={row.page} target="_blank" rel="noreferrer">
            Abrir no site da transportadora
          </a>
        )}
        <button
          className="btn"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(row.code).then(
              () => onChanged("Código copiado."),
              () => onError("Não consegui copiar o código."),
            );
          }}
        >
          Copiar código
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            void api.deleteShipment(row.id).then(
              () => onChanged("Encomenda removida da lista."),
              () => onError("Não consegui remover a encomenda."),
            );
          }}
        >
          Remover
        </button>
      </div>
      {(row.provider === "pacotevicio" || row.attribution) && (
        <a href={PACOTEVICIO_ATTRIBUTION.href} target="_blank" rel="noreferrer">
          {PACOTEVICIO_ATTRIBUTION.label}
        </a>
      )}
    </li>
  );
}
