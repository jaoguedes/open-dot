export const PII_RULES: Array<{ id: string; test: (line: string) => boolean }>;
export const PII_SKIP: RegExp[];
export function localTerms(root?: string, env?: Record<string, string | undefined>): string[];
export function scanPii(path: string, text: string, terms?: string[]): Array<{ path: string; line: number; rule: string }>;
