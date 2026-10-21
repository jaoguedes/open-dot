// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { api, ApiError } from "../api.ts";
import { useApp } from "../store.tsx";

/**
 * "Era importante" / "Não importa" (G). "Não importa" tira o item da lista aberta;
 * dois do mesmo remetente o silenciam. O aviso (com Desfazer) aparece na faixa do topo,
 * porque o item some da lista.
 */
export function TriageButtons({ messageId, categoria }: { messageId: string; categoria: string }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (app.mode !== "live") return null;
  const send = async (rotulo: "importante" | "nao_importa") => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.correioFeedback({ messageId, categoria, rotulo });
      const text =
        r.silenced && r.label
          ? `Silenciei ${r.label}. Os próximos e-mails dele vão para o ruído.`
          : rotulo === "importante"
            ? "Anotado: esse remetente importa. O item subiu para o topo."
            : "Anotado. Mais um “Não importa” desse remetente e eu o silencio.";
      app.setNotice({ text, ...(r.silenced && r.hash ? { undoHash: r.hash } : {}) });
      app.markTriage(messageId, rotulo);
      await app.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui salvar.");
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
      {error && (
        <p className="tiny err-text" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
