export const RULES: Array<{ id: string; re: RegExp }>;
export const SKIP: RegExp[];
export function scanText(path: string, text: string): Array<{ path: string; line: number; rule: string }>;
