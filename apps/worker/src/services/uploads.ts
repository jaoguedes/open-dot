import { ALLOWED_TYPES, MAX_BYTES, MAX_TEXT_CHARS, judgeExtraction, normalizeText, organizeText, randomId, sha256Hex, validateFile, type Organized } from "@open-dot/core";
import type { Ctx } from "../context.ts";
import { open, seal } from "../crypto.ts";
import * as repo from "../repo.ts";

/**
 * Absorção de arquivos. O navegador extrai o texto; o servidor confere tamanho, tipo e hash,
 * guarda o texto cifrado e só então responde "recebido". "Organizado" só existe depois que o
 * run `file_organize` termina (inline pelo pedido do app ou pelo cron, com lease + CAS).
 */

export const UPLOADS_PER_DAY = 30;
/** Corpo JSON máximo: texto limite em UTF-8 (até 3 bytes por caractere) + metadados. */
export const MAX_UPLOAD_BODY = MAX_TEXT_CHARS * 3 + 4096;

const iso = (t: number) => new Date(t).toISOString();
const HEX64 = /^[0-9a-f]{64}$/;
const MIME_OK = new Set<string>([...ALLOWED_TYPES, "", "text/x-markdown", "application/octet-stream"]);

export interface UploadInput {
  fileName: string;
  mime: string;
  fileBytes: number;
  fileSha256: string;
  text: string;
  textSha256: string;
  pages: number | null;
}

export type CreateResult =
  { ok: true; id: string; runId: string; state: "received" } | { ok: false; status: number; code: string; message: string; existing?: { id: string; state: string; createdAt: string } };

export function parseUploadInput(raw: unknown): UploadInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const fileName = s(r.fileName, 200);
  const mime = s(r.mime, 100);
  // O teto real do texto é o do corpo; acima de MAX_TEXT_CHARS a resposta é "text_too_long" (422).
  const text = s(r.text, MAX_UPLOAD_BODY);
  const fileSha256 = s(r.fileSha256, 64);
  const textSha256 = s(r.textSha256, 64);
  const fileBytes = typeof r.fileBytes === "number" && Number.isInteger(r.fileBytes) ? r.fileBytes : null;
  const pages = r.pages === null || r.pages === undefined ? null : typeof r.pages === "number" && Number.isInteger(r.pages) && r.pages >= 0 && r.pages <= 10_000 ? r.pages : -1;
  if (fileName === null || mime === null || text === null || !fileSha256 || !textSha256 || fileBytes === null || pages === -1) return null;
  return { fileName, mime, fileBytes, fileSha256: fileSha256.toLowerCase(), text, textSha256: textSha256.toLowerCase(), pages };
}

export async function createUpload(ctx: Ctx, ownerId: string, input: UploadInput): Promise<CreateResult> {
  const fail = (status: number, code: string, message: string) => ({ ok: false as const, status, code, message });
  if (!HEX64.test(input.fileSha256) || !HEX64.test(input.textSha256)) return fail(400, "invalid_hash", "Hash do arquivo em formato inválido.");
  if (input.fileBytes > MAX_BYTES) return fail(413, "too_large", "Arquivo maior que 5 MB.");
  const typeErr = validateFile({ bytes: input.fileBytes, mime: input.mime, fileName: input.fileName });
  if (typeErr) return fail(415, "unsupported", typeErr);
  // Extensão obrigatória e coerente com o tipo declarado: um .exe com mime text/plain não passa.
  const isPdf = /\.pdf$/i.test(input.fileName);
  const mimeOk = MIME_OK.has(input.mime) && (input.mime !== "application/pdf" || isPdf);
  if (!/\.(pdf|txt|md|markdown)$/i.test(input.fileName) || !mimeOk) return fail(415, "unsupported", "Tipo não suportado nesta fase (PDF textual, TXT ou Markdown).");
  if (/\.pdf$/i.test(input.fileName) !== (input.pages !== null)) return fail(400, "invalid_input", "Contagem de páginas inconsistente com o tipo do arquivo.");
  if ((await sha256Hex(input.text)) !== input.textSha256) return fail(422, "hash_mismatch", "O texto chegou diferente do que foi extraído. Tente de novo.");
  const verdict = judgeExtraction(input.text, input.pages);
  if (!verdict.ok) return fail(422, verdict.code === "too_long" ? "text_too_long" : verdict.code === "scanned" ? "no_text_scanned" : "no_text", verdict.message);

  const now = ctx.now();
  const dup = await ctx.db.query<{ id: string; state: string; created_at: string }>("SELECT id, state, created_at FROM od_uploads WHERE owner_id = ? AND file_sha256 = ?", [ownerId, input.fileSha256]);
  if (dup[0]) return { ...fail(409, "duplicate", "Este arquivo já foi absorvido antes (mesmo conteúdo)."), existing: { id: dup[0].id, state: dup[0].state, createdAt: dup[0].created_at } };
  const today = (await ctx.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM od_uploads WHERE owner_id = ? AND created_at >= ?", [ownerId, iso(now - 86_400_000)]))[0]?.n ?? 0;
  if (today >= UPLOADS_PER_DAY) return fail(429, "limit", `Limite de ${UPLOADS_PER_DAY} arquivos por dia atingido.`);

  const id = randomId("up_");
  const runId = randomId("run_");
  const text = normalizeText(input.text);
  try {
    await ctx.db.batch([
      {
        sql: "INSERT INTO od_uploads (id, owner_id, file_sha256, text_sha256, file_name_enc, mime, file_bytes, text_chars, pages, text_enc, state, run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)",
        args: [
          id,
          ownerId,
          input.fileSha256,
          input.textSha256,
          await seal(ctx.keys, input.fileName, `upload-name:${id}`),
          input.mime || "application/octet-stream",
          input.fileBytes,
          text.length,
          input.pages,
          await seal(ctx.keys, text, `upload:${id}`),
          runId,
          iso(now),
          iso(now),
        ],
      },
      {
        sql: "INSERT INTO od_runs (id, owner_id, routine_id, agent_id, kind, slot_key, scheduled_at, late, state, version, attempt, next_attempt_at, created_at, updated_at) VALUES (?, ?, NULL, 'dot', 'file_organize', ?, ?, 0, 'queued', 1, 0, ?, ?, ?)",
        args: [runId, ownerId, `${ownerId}:upload:${id}`, iso(now), iso(now), iso(now), iso(now)],
      },
    ]);
  } catch (e) {
    // Dois envios simultâneos do mesmo arquivo: a UNIQUE garante um só registro.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return fail(409, "duplicate", "Este arquivo já foi absorvido antes (mesmo conteúdo).");
    throw e;
  }
  await repo.audit(ctx.db, { ownerId, actor: "user", action: "upload", target: id, outcome: "received", detail: `bytes=${input.fileBytes} chars=${text.length}`, now });
  return { ok: true, id, runId, state: "received" };
}

/** Executa o run de organização já tomado (claim) por quem chamou. */
export async function organizeUpload(ctx: Ctx, run: repo.RunRow): Promise<{ state: "succeeded" | "failed"; errorCode?: string; message?: string }> {
  const rows = await ctx.db.query<{ id: string; owner_id: string; file_name_enc: string; mime: string; pages: number | null; text_enc: string; state: string }>(
    "SELECT id, owner_id, file_name_enc, mime, pages, text_enc, state FROM od_uploads WHERE owner_id = ? AND run_id = ?",
    [run.owner_id, run.id],
  );
  const up = rows[0];
  if (!up) return { state: "failed", errorCode: "not_found", message: "Arquivo não encontrado." };
  if (up.state === "organized") return { state: "succeeded" };
  await ctx.db.run("UPDATE od_uploads SET state = 'processing', updated_at = ? WHERE id = ? AND owner_id = ? AND state IN ('received','failed')", [iso(ctx.now()), up.id, up.owner_id]);
  try {
    const fileName = await open(ctx.keys, up.file_name_enc, `upload-name:${up.id}`);
    const text = await open(ctx.keys, up.text_enc, `upload:${up.id}`);
    const result = organizeText({ text, fileName, mime: up.mime, pages: up.pages });
    await ctx.db.run("UPDATE od_uploads SET state = 'organized', result_enc = ?, error_code = NULL, error_message = NULL, updated_at = ? WHERE id = ? AND owner_id = ?", [
      await seal(ctx.keys, JSON.stringify(result), `upload-result:${up.id}`),
      iso(ctx.now()),
      up.id,
      up.owner_id,
    ]);
    await repo.insertFeed(ctx.db, ctx.keys, {
      ownerId: up.owner_id,
      agentId: "dot",
      runId: run.id,
      kind: "file_organized",
      // O título do feed fica em claro no banco; nome e conteúdo do arquivo só no corpo cifrado.
      title: "Arquivo organizado",
      body: {
        headline: result.title,
        summary: `${result.title} — ${result.words.toLocaleString("pt-BR")} palavras${result.pages ? ` em ${result.pages} páginas` : ""}. Termos: ${result.keywords.slice(0, 5).join(", ") || "—"}. Organizado por regras, sem IA.`,
      },
      freshness: "fresh",
      coverage: null,
      now: ctx.now(),
    });
    return { state: "succeeded" };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "erro";
    await ctx.db.run("UPDATE od_uploads SET state = 'failed', error_code = 'organize_failed', error_message = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [
      "Não consegui organizar o texto.",
      iso(ctx.now()),
      up.id,
      up.owner_id,
    ]);
    return { state: "failed", errorCode: "organize_failed", message };
  }
}

/** Pedido do app para processar agora. Se o cron já pegou, só devolve o estado atual. */
export async function processNow(ctx: Ctx, ownerId: string, id: string): Promise<UploadView | null> {
  const up = (await ctx.db.query<{ run_id: string | null }>("SELECT run_id FROM od_uploads WHERE id = ? AND owner_id = ?", [id, ownerId]))[0];
  if (!up) return null;
  const loadRun = () => (up.run_id ? ctx.db.query<repo.RunRow>("SELECT * FROM od_runs WHERE id = ? AND owner_id = ?", [up.run_id, ownerId]) : Promise.resolve([]));
  let run = (await loadRun())[0];
  if (run && (run.state === "queued" || run.state === "retry_scheduled")) {
    let claimed = await repo.claimRun(ctx.db, run, ctx.now());
    if (!claimed) {
      run = (await loadRun())[0];
      if (run && (run.state === "queued" || run.state === "retry_scheduled")) claimed = await repo.claimRun(ctx.db, run, ctx.now());
    }
    if (claimed) {
      const r = await organizeUpload(ctx, claimed);
      await repo.finishRun(ctx.db, claimed, { state: r.state, ...(r.errorCode ? { errorCode: r.errorCode } : {}), ...(r.message ? { errorMessage: r.message } : {}), now: ctx.now() });
    }
  }
  return getUpload(ctx, ownerId, id);
}

export interface UploadView {
  id: string;
  fileName: string;
  mime: string;
  fileBytes: number;
  textChars: number;
  pages: number | null;
  state: "received" | "processing" | "organized" | "failed";
  runId: string | null;
  result: Organized | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

type UploadRow = {
  id: string;
  file_name_enc: string;
  mime: string;
  file_bytes: number;
  text_chars: number;
  pages: number | null;
  state: UploadView["state"];
  run_id: string | null;
  result_enc: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

async function toView(ctx: Ctx, r: UploadRow, withResult: boolean): Promise<UploadView> {
  return {
    id: r.id,
    fileName: await open(ctx.keys, r.file_name_enc, `upload-name:${r.id}`),
    mime: r.mime,
    fileBytes: r.file_bytes,
    textChars: r.text_chars,
    pages: r.pages,
    state: r.state,
    runId: r.run_id,
    result: withResult && r.result_enc ? (JSON.parse(await open(ctx.keys, r.result_enc, `upload-result:${r.id}`)) as Organized) : null,
    error: r.error_code ? { code: r.error_code, message: r.error_message ?? "Erro." } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS = "id, file_name_enc, mime, file_bytes, text_chars, pages, state, run_id, result_enc, error_code, error_message, created_at, updated_at";

export async function getUpload(ctx: Ctx, ownerId: string, id: string): Promise<UploadView | null> {
  const r = (await ctx.db.query<UploadRow>(`SELECT ${COLS} FROM od_uploads WHERE id = ? AND owner_id = ?`, [id, ownerId]))[0];
  return r ? toView(ctx, r, true) : null;
}

export async function listUploads(ctx: Ctx, ownerId: string): Promise<UploadView[]> {
  const rows = await ctx.db.query<UploadRow>(`SELECT ${COLS} FROM od_uploads WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20`, [ownerId]);
  return Promise.all(rows.map((r) => toView(ctx, r, false)));
}

export async function deleteUpload(ctx: Ctx, ownerId: string, id: string): Promise<boolean> {
  const up = (await ctx.db.query<{ run_id: string | null }>("SELECT run_id FROM od_uploads WHERE id = ? AND owner_id = ?", [id, ownerId]))[0];
  if (!up) return false;
  await ctx.db.batch([
    { sql: "DELETE FROM od_uploads WHERE id = ? AND owner_id = ?", args: [id, ownerId] },
    { sql: "DELETE FROM od_feed_items WHERE owner_id = ? AND run_id = ? AND kind = 'file_organized'", args: [ownerId, up.run_id] },
    {
      sql: "UPDATE od_runs SET state = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND state IN ('queued','retry_scheduled')",
      args: [iso(ctx.now()), up.run_id, ownerId],
    },
  ]);
  return true;
}
