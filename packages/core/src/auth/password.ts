import { base64UrlDecode, base64UrlEncode } from "./base64url.js";

/**
 * Password hashing via PBKDF2 over WebCrypto (`crypto.subtle`), not argon2.
 *
 * Why: argon2's reference implementations are native Node bindings and don't
 * run on Cloudflare Workers, which apps/api must be able to deploy to
 * (Build Plan §1.1). WebCrypto's PBKDF2 needs no native dependency and runs
 * identically on Node and Workers. It's a weaker KDF than argon2 taken
 * alone, so it's used at a high iteration count per current OWASP guidance,
 * alongside the strong password policy already required by §14
 * (see packages/contracts/src/auth.ts `passwordSchema`).
 */

const ALGO = "pbkdf2-sha256";
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Returns a self-describing string: `pbkdf2-sha256$<iterations>$<saltB64url>$<hashB64url>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return [ALGO, ITERATIONS, base64UrlEncode(salt), base64UrlEncode(hash)].join("$");
}

/** Constant-time compare against a stored hash produced by {@link hashPassword}. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGO) {
    return false;
  }
  const iterations = Number(parts[1]);
  const salt = base64UrlDecode(parts[2] as string);
  const expected = base64UrlDecode(parts[3] as string);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }
  const actual = await deriveBits(password, salt, iterations);
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= (actual[i] as number) ^ (expected[i] as number);
  }
  return diff === 0;
}
