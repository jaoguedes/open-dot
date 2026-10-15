/**
 * Cifra AEAD (AES-256-GCM) com chave versionada fora do banco.
 * TOKEN_KEYS="v2:<base64 32 bytes>,v1:<base64 32 bytes>" — a primeira é usada para cifrar;
 * as demais só para decifrar (rotação). Formato salvo: "v2.<iv b64url>.<ct b64url>".
 * Isto não é E2EE: o Worker decifra para processar.
 */

export interface Keyring {
  current: string;
  keys: Map<string, CryptoKey>;
}

function b64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "===".slice((norm.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function loadKeyring(spec: string | undefined): Promise<Keyring> {
  if (!spec) throw new Error("TOKEN_KEYS não configurado");
  const keys = new Map<string, CryptoKey>();
  let current = "";
  for (const part of spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [ver, b64] = part.split(":");
    if (!ver || !b64 || !/^v\d+$/.test(ver)) throw new Error("TOKEN_KEYS em formato inválido");
    const raw = b64ToBytes(b64);
    if (raw.length !== 32) throw new Error(`chave ${ver} precisa ter 32 bytes`);
    keys.set(ver, await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]));
    if (!current) current = ver;
  }
  if (!current) throw new Error("TOKEN_KEYS vazio");
  return { current, keys };
}

export async function seal(k: Keyring, plaintext: string, aad = ""): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, k.keys.get(k.current)!, new TextEncoder().encode(plaintext));
  return `${k.current}.${bytesToB64url(iv)}.${bytesToB64url(new Uint8Array(ct))}`;
}

export async function open(k: Keyring, sealed: string, aad = ""): Promise<string> {
  const [ver, ivB, ctB] = sealed.split(".");
  const key = ver ? k.keys.get(ver) : undefined;
  if (!key || !ivB || !ctB) throw new Error("segredo ilegível ou chave desconhecida");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivB) as BufferSource, additionalData: new TextEncoder().encode(aad) }, key, b64ToBytes(ctB) as BufferSource);
  return new TextDecoder().decode(pt);
}

/** Token aleatório para cookie de sessão/state. Só o hash vai para o banco. */
export function randomToken(bytes = 32): string {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE S256. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToB64url(new Uint8Array(d));
}
