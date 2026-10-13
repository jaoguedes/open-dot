/**
 * Absorção de arquivos (capítulo 39 + correção do João).
 * A animação de absorção é visual; "recebido" e "organizado" só aparecem
 * depois dos eventos reais correspondentes. O Dot só comemora "organized".
 */

export type AbsorptionPhase =
  | "idle"
  | "selected" // arquivo válido escolhido localmente
  | "uploading" // envio em andamento
  | "received" // persistência confirmada pelo servidor
  | "processing" // job de extração/organização rodando
  | "organized" // job concluído com resultado salvo
  | "failed"
  | "cancelled";

export type AbsorptionEvent =
  | { type: "select"; fileName: string; bytes: number; mime: string }
  | { type: "upload_started" }
  | { type: "upload_progress"; loaded: number; total: number | null }
  | { type: "persisted"; uploadId: string }
  | { type: "job_started"; jobId: string }
  | { type: "job_succeeded"; jobId: string }
  | { type: "failed"; reason: string }
  | { type: "cancel" };

export interface AbsorptionState {
  phase: AbsorptionPhase;
  fileName: string | null;
  uploadId: string | null;
  jobId: string | null;
  /** Progresso real; null quando não mensurável (não inventar porcentagem). */
  progress: number | null;
  error: string | null;
  /** A animação de entrada pelo tracinho deve tocar? Toca uma vez por arquivo. */
  playAbsorbAnimation: boolean;
  /** Comemoração permitida apenas em "organized". */
  celebrate: boolean;
  label: string;
}

export const ALLOWED_TYPES = ["application/pdf", "text/plain", "text/markdown"] as const;
export const MAX_BYTES = 5 * 1024 * 1024;

export const initialAbsorption: AbsorptionState = {
  phase: "idle",
  fileName: null,
  uploadId: null,
  jobId: null,
  progress: null,
  error: null,
  playAbsorbAnimation: false,
  celebrate: false,
  label: "",
};

const LABEL: Record<AbsorptionPhase, string> = {
  idle: "",
  selected: "Arquivo selecionado",
  uploading: "Enviando arquivo",
  received: "Arquivo recebido",
  processing: "Processando arquivo",
  organized: "Arquivo organizado",
  failed: "Não consegui processar este arquivo",
  cancelled: "Envio cancelado",
};

export function validateFile(f: { bytes: number; mime: string; fileName: string }): string | null {
  if (f.bytes <= 0) return "Arquivo vazio.";
  if (f.bytes > MAX_BYTES) return "Arquivo maior que 5 MB.";
  const okMime = (ALLOWED_TYPES as readonly string[]).includes(f.mime);
  const okExt = /\.(pdf|txt|md|markdown)$/i.test(f.fileName);
  if (!okMime && !okExt) return "Tipo não suportado nesta fase (PDF textual, TXT ou Markdown).";
  return null;
}

export function reduceAbsorption(s: AbsorptionState, e: AbsorptionEvent): AbsorptionState {
  const to = (phase: AbsorptionPhase, patch: Partial<AbsorptionState> = {}): AbsorptionState => ({
    ...s,
    ...patch,
    phase,
    celebrate: phase === "organized",
    label: patch.error ? `${LABEL.failed}: ${patch.error}` : LABEL[phase],
  });

  switch (e.type) {
    case "select": {
      if (s.phase !== "idle" && s.phase !== "organized" && s.phase !== "failed" && s.phase !== "cancelled") return s;
      const err = validateFile(e);
      if (err) return to("failed", { ...initialAbsorption, fileName: e.fileName, error: err, playAbsorbAnimation: false });
      return to("selected", { ...initialAbsorption, fileName: e.fileName, playAbsorbAnimation: true });
    }
    case "upload_started":
      return s.phase === "selected" ? to("uploading", { playAbsorbAnimation: false }) : s;
    case "upload_progress":
      if (s.phase !== "uploading") return s;
      return to("uploading", { progress: e.total ? Math.min(1, e.loaded / e.total) : null });
    case "persisted":
      return s.phase === "uploading" || s.phase === "selected" ? to("received", { uploadId: e.uploadId, progress: null }) : s;
    case "job_started":
      return s.phase === "received" ? to("processing", { jobId: e.jobId }) : s;
    case "job_succeeded":
      // Só conclui o job que estava em processamento.
      return s.phase === "processing" && s.jobId === e.jobId ? to("organized") : s;
    case "failed":
      if (s.phase === "idle" || s.phase === "organized" || s.phase === "cancelled") return s;
      // Retry não repete a animação de absorção.
      return to("failed", { error: e.reason, playAbsorbAnimation: false });
    case "cancel":
      if (s.phase === "organized" || s.phase === "idle") return s;
      return to("cancelled", { playAbsorbAnimation: false });
  }
}
