import { useState } from "react";
import { api, ApiError } from "../api.ts";
import { useApp } from "../store.tsx";

/** "Era importante" / "Não importa" (G). Dois "Não importa" do mesmo remetente o silenciam. */
export function TriageButtons({ messageId, categoria }: { messageId: string; categoria: string }) {
  const app = useApp();
  const [state, setState] = useState<{ text: string; hash?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (app.mode !== "live") return null;
  const send = async (rotulo: "importante" | "nao_importa") => {
    setBusy(true);
    try {
      const r = await api.correioFeedback({ messageId, categoria, rotulo });
      const text = r.silenced && r.label ? `Silenciei ${r.label}. Os próximos e-mails dele vão para o ruído.` : rotulo === "importante" ? "Anotado: esse remetente importa." : "Anotado. Mais um “Não importa” e eu silencio esse remetente.";
      setState({ text, ...(r.silenced && r.hash ? { hash: r.hash } : {}) });
      app.announce(text);
    } catch (e) {
      setState({ text: e instanceof ApiError ? e.message : "Não consegui salvar." });
    } finally {
      setBusy(false);
    }
  };
  const undo = async (hash: string) => {
    setBusy(true);
    try {
      await api.undoSilence(hash);
      setState({ text: "Desfeito. O remetente volta a aparecer." });
    } catch (e) {
      setState({ text: e instanceof ApiError ? e.message : "Não consegui desfazer." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row-actions triage">
      <button className="btn ghost" type="button" disabled={busy} onClick={() => void send("importante")}>
        Era importante
      </button>
      <button className="btn ghost" type="button" disabled={busy} onClick={() => void send("nao_importa")}>
        Não importa
      </button>
      {state && (
        <p className="tiny" role="status">
          {state.text}
          {state.hash && (
            <>
              {" "}
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void undo(state.hash!)}>
                Desfazer
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
