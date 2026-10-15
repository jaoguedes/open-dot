/**
 * Varredura de segredos nos arquivos versionados (F1). Regex própria, sem dependência.
 * Procura formatos de chave conhecidos e atribuições a nomes de segredo com valor real.
 */
export const RULES = [
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: "github-fine-grained", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { id: "groq-key", re: /\bgsk_[A-Za-z0-9]{40,}\b/ },
  { id: "openai-like-key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "google-oauth-secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { id: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/ },
  { id: "libsql-url-with-token", re: /libsql:\/\/[^\s"']+\?[^\s"']*authToken=[A-Za-z0-9._-]{20,}/ },
  {
    id: "secret-assignment",
    re: /\b(TURSO_AUTH_TOKEN|GOOGLE_CLIENT_SECRET|TOKEN_KEYS|GROQ_API_KEY|GITHUB_WEBHOOK_SECRET|GITHUB_APP_PRIVATE_KEY|VERCEL_TOKEN|FINNHUB_API_KEY|COINGECKO_DEMO_API_KEY|PACOTEVICIO_API_KEY)\s*[=:]\s*["']?(?!["'\s]|\$|<|process\.env|ctx\.|env\.|vars\.|undefined|null|z\.)[A-Za-z0-9+/_.:-]{12,}/,
  },
];

/** Arquivos que não são texto do projeto ou que listam padrões de propósito. */
export const SKIP = [/^node_modules\//, /\.(png|jpg|jpeg|gif|webp|woff2?|mp3|glb|blend|pdf|ico)$/i, /^package-lock\.json$/, /^scripts\/lib\/secret-scan\.mjs$/, /^tests\/secret-scan\.test\.ts$/];

/** Valor que é só um nome de variável (sem aspas, sem dígito) não é segredo. */
function isIdentifierValue(line, re) {
  const m = re.exec(line);
  if (!m) return false;
  const rest = line.slice(m.index).split(/[=:]/).slice(1).join(":").trim();
  return /^[A-Za-z_][A-Za-z_]*[,;)}]?$/.test(rest);
}

export function scanText(path, text) {
  const out = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Valor falso de teste, marcado na própria linha.
    if (/scan-secrets: teste/.test(line)) return;
    for (const r of RULES) {
      if (!r.re.test(line)) continue;
      if (r.id === "secret-assignment" && isIdentifierValue(line, r.re)) continue;
      out.push({ path, line: i + 1, rule: r.id });
    }
  });
  return out;
}
