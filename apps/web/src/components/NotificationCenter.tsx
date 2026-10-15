import { lazy, Suspense, useMemo, useState } from "react";
import { buildEvents, readSeenAt, unseenCount, writeSeenAt } from "../events.ts";
import { useApp } from "../store.tsx";
import { Icon } from "./Icons.tsx";

const CenterPanel = lazy(() => import("./CenterPanel.tsx").then((m) => ({ default: m.CenterPanel })));

/** Sino do topo (D2): ponto quando há eventos novos; abre a Central do Dot. */
export function NotificationBell({ go }: { go: (p: string) => void }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(readSeenAt);
  const events = useMemo(() => buildEvents(app.snap), [app.snap]);
  const fresh = unseenCount(events, seenAt);
  const label = fresh ? `Notificações, ${fresh} ${fresh === 1 ? "nova" : "novas"}` : "Notificações";
  const markAll = () => {
    const newest = events[0]?.at ?? new Date().toISOString();
    writeSeenAt(newest);
    setSeenAt(newest);
    app.announce("Tudo marcado como visto.");
  };
  return (
    <>
      <button className="icon-btn bell" aria-label={label} aria-haspopup="dialog" aria-expanded={open} type="button" onClick={() => setOpen(true)}>
        <Icon name="bell" />
        {fresh > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>
      {open && (
        <Suspense fallback={null}>
          <CenterPanel
            events={events}
            seenAt={seenAt}
            onMarkAll={markAll}
            onClose={() => setOpen(false)}
            onPick={(path) => {
              setOpen(false);
              go(path);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
