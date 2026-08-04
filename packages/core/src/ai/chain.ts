import { withTimeout } from "./timeout.js";

/**
 * Provider fallback chain (docs/AI_PROVIDERS.md: Workers AI -> Groq ->
 * scripted last resort). The orchestration logic — try in order, fall
 * through on any failure, never hang forever on one provider — is pure and
 * takes provider calls as injected functions, so it's fully unit-testable
 * with fakes and needs no network access or API keys to verify. apps/api
 * supplies the real fetch-based implementations (apps/api/src/ai/providers.ts).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiProviderFn = (messages: ChatMessage[]) => Promise<string>;

export interface NamedProvider {
  name: string;
  call: AiProviderFn;
}

export interface FallbackResult {
  text: string;
  providerUsed: string;
  /** Every provider name tried, in order, including the one that succeeded. */
  attempted: string[];
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Always resolves as long as the chain includes a provider that cannot
 * itself fail (a scripted fallback with no I/O) as its last entry — that's
 * a contract the caller is responsible for, not something this function can
 * enforce. If every provider fails, it throws.
 */
export async function callWithFallback(
  providers: NamedProvider[],
  messages: ChatMessage[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<FallbackResult> {
  const attempted: string[] = [];
  for (const provider of providers) {
    attempted.push(provider.name);
    try {
      const text = await withTimeout(provider.call(messages), timeoutMs, provider.name);
      return { text, providerUsed: provider.name, attempted };
    } catch {
      continue;
    }
  }
  throw new Error(`All providers in the fallback chain failed: ${attempted.join(", ")}`);
}
