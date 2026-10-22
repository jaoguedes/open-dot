// SPDX-License-Identifier: AGPL-3.0-only
export interface LocalDiagnostics {
  os: string;
  arch: string;
  version: string;
  folders: string[];
  paired: boolean;
  checkpoints?: { items: Array<{ task: string; phase: string; headSha: string | null; terminalReceipt: string | null }>; unreadable: number; truncated: boolean };
  activeTask?: { id: string; phase: string; resumable: boolean } | null;
  channel?: { paired: boolean; online: boolean; message: string; deviceId?: string };
  drivers: Array<{ id: "codex" | "claude-code" | "cursor"; installed: boolean; authenticated: boolean; executable: boolean; reason: string }>;
}
export interface ProtectionRules {
  pauseHot: boolean;
  hotCpu: number;
  hotSecs: number;
  pauseBattery: boolean;
  batteryMin: number;
  pauseMemory: boolean;
  memoryMax: number;
}
export interface CompanionSettings {
  setupDone: boolean;
  updateConsent: boolean | null;
  autostart: boolean;
  showInDock: boolean;
  profile: "leve" | "equilibrado" | "maximo" | null;
  protection: ProtectionRules;
  lightOnBattery: boolean;
  autoCleanup: boolean;
  cleanupHours: number;
  notifications: boolean;
  queuePaused: boolean;
}
export interface CompanionView {
  settings: CompanionSettings;
  suggested: "leve" | "equilibrado" | "maximo";
  suggestedReason: string;
  effective: "leve" | "equilibrado" | "maximo";
  knobs: { concurrency: number; pollMinMs: number; pollMaxMs: number; uiFps: number; parallelAllowed: boolean };
  paused: string | null;
  version: string;
  updateKeyReady: boolean;
  os: string;
  arch: string;
}
export interface NativeSample {
  cpu: number;
  memory: number;
  memoryTotalGb: number;
  diskFreeGb: number | null;
  diskTotalGb: number | null;
  battery: { percent: number; charging: boolean; onAc: boolean } | null;
  cpuSpeedLimit: number | null;
  temperatureC: number | null;
  cores: number;
  atMs: number;
}
export interface HealthView {
  sample: NativeSample | null;
  paused: string | null;
  rules: ProtectionRules;
}
export interface ProcessItem {
  pid: number;
  label: string;
  kind: string;
  task: string | null;
  uptimeS: number;
  memoryBytes: number;
  group: "em_uso" | "parado";
  why: string;
}
type Command =
  | "diagnostics"
  | "choose_folder"
  | "revoke_folder"
  | "pair_begin"
  | "pair_confirm"
  | "pair_disconnect"
  | "checkpoint_preview"
  | "checkpoint_commit"
  | "export_project_context"
  | "companion_get"
  | "companion_set"
  | "health_get"
  | "processes_list"
  | "process_terminate"
  | "update_check"
  | "update_install"
  | "open_review"
  | "main_show";
interface TauriBridge {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  event?: { listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<() => void> };
}
const bridge = () => (window as Window & { __TAURI__?: TauriBridge }).__TAURI__;
export function nativeAvailable(): boolean {
  return Boolean(bridge()?.core);
}
export function invoke<T>(cmd: Command, args?: Record<string, unknown>): Promise<T> {
  const b = bridge();
  if (!b) return Promise.reject(new Error("Abra o aplicativo desktop para usar os recursos locais."));
  return b.core.invoke<T>(cmd, args);
}
/** Eventos do processo nativo (saúde, visibilidade, ajustes). Sem bridge, não escuta nada. */
export function listen<T>(name: "od-health" | "od-visibility" | "od-companion" | "od-update", cb: (payload: T) => void): () => void {
  const ev = bridge()?.event;
  if (!ev) return () => {};
  let off: (() => void) | null = null;
  let dead = false;
  void ev.listen<T>(name, (e) => cb(e.payload)).then((u) => (dead ? u() : (off = u)));
  return () => {
    dead = true;
    off?.();
  };
}
export function errorText(e: unknown, fallback: string): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : fallback;
}
