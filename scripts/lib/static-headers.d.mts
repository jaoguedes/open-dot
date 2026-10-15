export const CSP: string;
export function staticHeaders(): string;
export function resolveHeaders(text: string, path: string): Record<string, string>;
