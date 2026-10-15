export type DeploymentRow = { created_on?: unknown; versions?: Array<{ version_id?: unknown; percentage?: unknown }> };
export function activeVersionId(deployments: unknown): string | null;
export function parseDeploymentsJson(text: string): unknown[] | null;
export type SmokeFetch = (url: string) => Promise<{
  status: number;
  headers?: { get?: (name: string) => string | null };
  json(): Promise<any>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;
export function waitForSmoke(opts: {
  origin: string;
  appHash: string;
  timeoutMs: number;
  fetchImpl: SmokeFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ ok: true; app: string; worker: string | null } | null>;
