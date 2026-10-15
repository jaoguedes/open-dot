import { useMemo, useRef, useState } from "react";
import { AGENTS, type AgentId } from "@open-dot/core";
import { ApiError } from "../api.ts";
import { askDot, saveLastAnswer, type SavedAnswer } from "../ask.ts";
import { useApp } from "../store.tsx";
import { AnswerView } from "./AnswerView.tsx";
import { Icon } from "./Icons.tsx";
import { useDialog } from "./useDialog.ts";
import { sound } from "../sound.ts";

export interface PaletteEntry {
  id: string;
  group: "Ir para" | "Agentes" | "Perguntar";
  label: string;
  path?: string;
}

/** Resultados da paleta (D1): destinos, agentes e, com 2+ letras, "Perguntar ao Dot: …". Pura. */
export function paletteEntries(q: string, destinations: Array<{ label: string; path: string }>, agents: AgentId[]): PaletteEntry[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const query = norm(q.trim());
  const match = (label: string) => !query || norm(label).includes(query);
  const out: PaletteEntry[] = [
    ...destinations.filter((d) => match(d.label)).map((d) => ({ id: `go:${d.path}`, group: "Ir para" as const, label: d.label, path: d.path })),
    ...agents.filter((a) => match(AGENTS[a].name) || match(`agente ${AGENTS[a].name}`)).map((a) => ({ id: `agent:${a}`, group: "Agentes" as const, label: AGENTS[a].name, path: `/agente/${a}` })),
  ];
  if (q.trim().length >= 2) out.push({ id: "ask", group: "Perguntar", label: `Perguntar ao Dot: ${q.trim()}` });
  return out;
}

export function CommandPalette({ onClose, go, destinations, agents }: { onClose: () => void; go: (p: string) => void; destinations: Array<{ label: string; path: string }>; agents: AgentId[] }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<SavedAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useDialog(true, box, onClose, input);

  const entries = useMemo(() => paletteEntries(q, destinations, agents), [q, destinations, agents]);
  const current = Math.min(active, Math.max(0, entries.length - 1));

  const ask = async (question: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      sound.play("dot-send");
      const r = await askDot(question, app.mode === "demo" ? app.snap : null);
      const saved = { ...r, question };
      sound.play("dot-receive");
      setAnswer(saved);
      saveLastAnswer(saved);
      app.announce(r.answer);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "offline" ? "Sem conexão. Sua pergunta não foi enviada." : "Não consegui responder agora. Nada foi alterado.");
    } finally {
      setBusy(false);
    }
  };
  const choose = (e: PaletteEntry | undefined) => {
    if (!e) return;
    if (e.id === "ask") return void ask(q.trim());
    if (e.path) {
      go(e.path);
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="scrim palette-scrim" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Buscar ou perguntar" className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[current] ? `pal-${current}` : undefined}
            aria-label="Ir para ou perguntar ao Dot"
            placeholder="Ir para… ou pergunte ao Dot"
            value={q}
            enterKeyHint="go"
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((current + 1) % Math.max(1, entries.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((current - 1 + entries.length) % Math.max(1, entries.length));
              } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                choose(entries[current]);
              }
            }}
          />
          <button className="btn ghost palette-close" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <ul id="palette-list" role="listbox" aria-label="Resultados" className="palette-list">
          {entries.map((e, i) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <li key={e.id} role="presentation">
                {head && (
                  <div className="palette-group" aria-hidden="true">
                    {head}
                  </div>
                )}
                <div
                  id={`pal-${i}`}
                  role="option"
                  aria-selected={i === current}
                  className={`palette-item ${i === current ? "on" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(e)}
                >
                  <Icon name={e.id === "ask" ? "sparkle" : "arrow"} size={14} /> {e.label}
                </div>
              </li>
            );
          })}
          {!entries.length && <li className="meta palette-empty">Nada encontrado. Digite 2 letras para perguntar ao Dot.</li>}
        </ul>
        {busy && (
          <p className="meta" role="status">
            Procurando nas suas revisões…
          </p>
        )}
        {error && (
          <p className="chip err" role="alert">
            {error}
          </p>
        )}
        {answer && <AnswerView answer={answer} />}
      </div>
    </div>
  );
}
