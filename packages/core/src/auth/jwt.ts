import { base64UrlDecode, base64UrlDecodeString, base64UrlEncode, base64UrlEncodeString } from "./base64url.js";

/**
 * Minimal HS256 JWT sign/verify over WebCrypto, deliberately not the
 * `jsonwebtoken` package: that library shells out to Node's `crypto` module,
 * which isn't available on Cloudflare Workers. HMAC-SHA256 via
 * `crypto.subtle` runs identically on Node and Workers (Build Plan §1.1).
 */

export interface JwtPayload {
  sub: string;
  [claim: string]: unknown;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(
  payload: JwtPayload,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export class JwtError extends Error {}

export async function verifyJwt<T extends JwtPayload = JwtPayload>(
  token: string,
  secret: string,
): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtError("Malformed token.");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(encodedSignature) as BufferSource,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) {
    throw new JwtError("Invalid signature.");
  }

  const payload = JSON.parse(base64UrlDecodeString(encodedPayload)) as T & { exp?: number };
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new JwtError("Token expired.");
  }
  return payload;
}
