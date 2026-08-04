import { base64UrlEncode } from "./base64url.js";

/** A high-entropy opaque refresh token — not a JWT, so it carries no decodable claims. */
export function randomOpaqueToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * SHA-256 digest of a refresh token for storage (Session.refreshTokenHash).
 * A fast digest is fine here — unlike a password, this input is already
 * high-entropy random data, not something an attacker can dictionary-guess.
 */
export async function hashOpaqueToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}
