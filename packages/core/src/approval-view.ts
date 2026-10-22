// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tela de Aprovações (v0.3): o que é mostrado e o que o hash cobre são a MESMA coisa. O diff é
 * derivado só do texto exato da proposta (`raw`); o hash exibido é o SHA-256 UTF-8 desse texto,
 * recalculado no navegador. Aprovar só habilita quando o recálculo bate com o hash que o servidor
 * guardou. Rejeitar não depende do hash.
 */
export interface ProposalFile {
  path: string;
  content: string;
  beforeHash: string | null;
  beforeContent?: string;
}
export interface Proposal {
  summary: string;
  files: ProposalFile[];
}

export interface DiffLine {
  kind: "+" | "-" | " ";
  text: string;
}
export interface FileDiff {
  path: string;
  novo: boolean;
  adicionadas: number;
  removidas: number;
  linhas: DiffLine[];
  /** Conteúdo anterior desconhecido: o diff mostra o arquivo inteiro como substituição. */
  anteriorDesconhecido: boolean;
}

export async function sha256Utf8(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lê a proposta do texto exato. Formato inesperado = null (a tela mostra o texto bruto e não aprova). */
export function parseProposal(raw: string): Proposal | null {
  try {
    const p = JSON.parse(raw) as Proposal;
    if (!p || typeof p.summary !== "string" || !Array.isArray(p.files) || !p.files.length || p.files.length > 8) return null;
    for (const f of p.files) {
      if (typeof f.path !== "string" || typeof f.content !== "string") return null;
      if (f.beforeContent !== undefined && typeof f.beforeContent !== "string") return null;
    }
    return p;
  } catch {
    return null;
  }
}

/** Diff por linhas (LCS), pequeno e determinístico; arquivos têm no máximo 8 KB. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const n = a.length,
    m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: " ", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ kind: "-", text: a[i++]! });
    else out.push({ kind: "+", text: b[j++]! });
  }
  while (i < n) out.push({ kind: "-", text: a[i++]! });
  while (j < m) out.push({ kind: "+", text: b[j++]! });
  return out;
}

export function fileDiffs(p: Proposal): FileDiff[] {
  return p.files.map((f) => {
    const novo = f.beforeHash === null;
    const unknown = !novo && f.beforeContent === undefined;
    const linhas = lineDiff(novo || unknown ? "" : (f.beforeContent ?? ""), f.content);
    return {
      path: f.path,
      novo,
      anteriorDesconhecido: unknown,
      adicionadas: linhas.filter((l) => l.kind === "+").length,
      removidas: linhas.filter((l) => l.kind === "-").length,
      linhas,
    };
  });
}

export function totals(d: FileDiff[]): { arquivos: number; adicionadas: number; removidas: number } {
  return { arquivos: d.length, adicionadas: d.reduce((s, x) => s + x.adicionadas, 0), removidas: d.reduce((s, x) => s + x.removidas, 0) };
}

export interface ApprovableState {
  hashExibido: string;
  hashConfere: boolean;
  podeAprovar: boolean;
  motivo: string | null;
}

/**
 * Decide se o botão Aprovar habilita. O hash exibido é sempre o recalculado do texto mostrado; se
 * divergir do guardado pelo servidor, a tela diz isso e não aprova.
 */
export async function approvable(raw: string, serverHash: string, ctx: { pending: boolean; expired: boolean; runnerOnline: boolean }): Promise<ApprovableState> {
  const hashExibido = await sha256Utf8(raw);
  const hashConfere = hashExibido === serverHash;
  const motivo = !ctx.pending
    ? "Esta proposta já foi decidida."
    : ctx.expired
      ? "A proposta expirou. Peça uma nova ao Runner."
      : !hashConfere
        ? "O conteúdo mostrado não bate com o hash guardado. Aprovação bloqueada."
        : parseProposal(raw) === null
          ? "Formato da proposta não reconhecido. Aprovação bloqueada."
          : !ctx.runnerOnline
            ? "O Runner que vai aplicar a proposta está offline."
            : null;
  return { hashExibido, hashConfere, podeAprovar: motivo === null, motivo };
}
