export interface DeployTarget {
  appOrigin: string;
  ownerName: string;
}
export const DEPLOY_FILE: string;
export function validOrigin(origin: unknown): boolean;
export function deployTarget(opts: { root: string; env?: Record<string, string | undefined> }): DeployTarget;
export function wranglerVarArgs(target: DeployTarget): string[];
