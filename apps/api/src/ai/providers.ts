import type { ai } from "@careconnect/core";
import type { AiProviderConfig } from "../env.js";

/**
 * Concrete fetch-based providers per docs/AI_PROVIDERS.md. Written against
 * each API's documented REST contract, but this repo has no live
 * CF_ACCOUNT_ID / GROQ_API_KEY configured in any environment it's been run
 * in so far — the request-building and response-parsing here have not been
 * exercised against a real endpoint. What *is* verified end-to-end is the
 * failure path: an unconfigured or failing provider correctly throws, which
 * `ai.callWithFallback` (tested with fakes in packages/core) turns into a
 * move to the next provider, ending at the scripted last resort. Treat
 * these two functions as reviewed-but-unverified until exercised with real
 * credentials.
 */

const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const GROQ_MODEL = "openai/gpt-oss-20b";

export function createWorkersAiProvider(config: AiProviderConfig): ai.AiProviderFn {
  return async (messages) => {
    if (!config.cfAccountId || !config.cfWorkersAiApiToken) {
      throw new Error("Workers AI is not configured (missing CF_ACCOUNT_ID or CF_WORKERS_AI_API_TOKEN).");
    }
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/ai/run/${CF_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.cfWorkersAiApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      },
    );
    if (!response.ok) {
      throw new Error(`Workers AI request failed with status ${response.status}.`);
    }
    const data = (await response.json()) as { result?: { response?: string } };
    const text = data.result?.response;
    if (!text) {
      throw new Error("Workers AI returned an empty response.");
    }
    return text;
  };
}

export function createGroqProvider(config: AiProviderConfig): ai.AiProviderFn {
  return async (messages) => {
    if (!config.groqApiKey) {
      throw new Error("Groq is not configured (missing GROQ_API_KEY).");
    }
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages }),
    });
    if (!response.ok) {
      throw new Error(`Groq request failed with status ${response.status}.`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Groq returned an empty response.");
    }
    return text;
  };
}
