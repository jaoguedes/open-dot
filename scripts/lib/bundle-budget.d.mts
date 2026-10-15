export const APP_JS_GOAL: number;
export const APP_JS_LIMIT: number;
export function checkAppJs(bytes: number): { ok: boolean; message: string | null };
export function initialBytes(entry: string, read?: (f: string) => string): { bytes: number; files: number };
