// Instructor auth for the Cloudflare Worker, using WebCrypto (no Node APIs).
// A shared password is exchanged for a signed, expiring token.

const encoder = new TextEncoder();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`rfc-token-secret:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createToken(secret: string): Promise<string> {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  const sig = toHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(exp)));
  return `${exp}.${sig}`;
}

export async function verifyToken(secret: string, token: string): Promise<boolean> {
  const [exp, sig] = (token || "").split(".");
  if (!exp || !sig) return false;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromHex(sig), encoder.encode(exp));
  } catch {
    return false;
  }
  return ok && Number(exp) > Date.now();
}

export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const a = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
  const b = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(expected)));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
