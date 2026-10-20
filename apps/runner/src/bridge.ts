export interface LocalDiagnostics {
  os: string;
  arch: string;
  version: string;
  folders: string[];
  paired: boolean;
  activeTask?: {id:string;phase:string;resumable:boolean}|null;
  channel?: { paired: boolean; online: boolean; message: string; deviceId?: string };
  drivers: Array<{ id: "codex" | "claude-code" | "cursor"; installed: boolean; authenticated: boolean; executable: boolean; reason: string }>;
}
interface TauriBridge {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
}
export function nativeAvailable(): boolean {
  return Boolean((window as Window & { __TAURI__?: TauriBridge }).__TAURI__?.core);
}
export function invoke<T>(cmd: "diagnostics" | "choose_folder" | "revoke_folder" | "pair_begin" | "pair_confirm" | "pair_disconnect", args?: Record<string, unknown>): Promise<T> {
  const bridge = (window as Window & { __TAURI__?: TauriBridge }).__TAURI__;
  if (!bridge) return Promise.reject(new Error("Abra o aplicativo desktop para usar os recursos locais."));
  return bridge.core.invoke<T>(cmd, args);
}
