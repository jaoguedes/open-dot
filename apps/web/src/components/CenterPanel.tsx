import { useRef } from "react";
import type { buildEvents } from "../events.ts";
import { fmtWhen } from "../format.ts";
import { useDialog } from "./useDialog.ts";

/** Central do Dot (D2): carregada só quando o sino é tocado. */
export function CenterPanel({ events, seenAt, onMarkAll, onClose, onPick }: { events: ReturnType<typeof buildEvents>; seenAt: string | null; onMarkAll: () => void; onClose: () => void; onPick: (p: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useDialog(true, box, onClose);
  return (
    <div className="scrim center-scrim" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="center-title" className="center-panel" onClick={(e) => e.stopPropagation()}>
        <div className="center-head">
          <h2 id="center-title">Central do Dot</h2>
          <button className="btn ghost" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
        {events.length === 0 ? (
          <p className="meta">Nada por aqui ainda. Execuções, falhas e itens novos aparecem nesta lista.</p>
        ) : (
          <>
            <ul className="center-list">
              {events.map((e) => (
                <li key={e.id}>
                  <button type="button" className={`center-item tone-${e.tone} ${!seenAt || e.at > seenAt ? "is-new" : ""}`} onClick={() => onPick(e.path)}>
                    <span className="center-text">{e.text}</span>
                    <span className="tiny mono">{fmtWhen(e.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="row-actions">
              <button className="btn" type="button" onClick={onMarkAll}>
                Marcar tudo como visto
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
