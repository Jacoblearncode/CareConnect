# AI Provider Verification

Verified 2026-08-04, ahead of Phase 0 closing per `docs/BUILD_PLAN.md` §4. Free-tier limits and
model catalogs change; re-check before Phase 4 (AI companion) and Phase 9 (label OCR) if this file
is more than a few months old.

## Companion chat (§8)

| Tier | Provider | Model ID | Notes |
| --- | --- | --- | --- |
| Primary | Cloudflare Workers AI | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 10,000 free "Neurons"/day per account, shared across all models, resets 00:00 UTC. Neuron cost varies by model — this fp8 70B model is far cheaper per call than a full-precision model of the same size, chosen for that reason. No credit card required. |
| Fallback | Groq | `openai/gpt-oss-20b` | Free tier: 14,400 requests/day, 30 requests/minute, whichever limit is hit first. **`llama-3.1-8b-instant` (originally planned) was deprecated by Groq in June 2026**; `openai/gpt-oss-20b` is Groq's documented replacement and is what's specified here. |
| Last resort | — | Scripted responses | `packages/core/ai` ships canned, safety-reviewed responses keyed by check-in mood and message intent, used when both providers fail or return non-2xx. |

## Label vision (§4, Phase 9)

| Tier | Provider | Model ID | Notes |
| --- | --- | --- | --- |
| Primary | Cloudflare Workers AI | `@cf/meta/llama-3.2-11b-vision-instruct` | Same free Neuron pool as companion chat — the two features share one daily budget, which is a reason to keep OCR calls infrequent (one per scan, not per frame). |
| Fallback | — | Tesseract.js on-device | Runs in the Expo app itself; no network or account limits. |
| Last resort | — | Manual entry | Always available; the `MedicationDraft` confirmation gate (§3.3 of the build plan) means this path is never less safe than the AI path, just less convenient. |

## Environment variables

```
CF_ACCOUNT_ID=
CF_WORKERS_AI_API_TOKEN=
GROQ_API_KEY=
```

All three are optional at the code level — `packages/core/ai`'s provider chain treats a missing key
as "skip to the next tier," so the app runs (with scripted responses / manual entry only) without
any AI credentials configured. This is what keeps the demo alive if a free tier is exhausted or a
key isn't set up on a given machine.

## Consequence for safety design

Both the primary and fallback models here are free-tier, open-weight instruction-tuned models, not
frontier models with strong RLHF safety tuning. Per `docs/BUILD_PLAN.md` §4, the §15 safety rules
(never diagnose, never prescribe, etc.) are therefore enforced as deterministic pre/post-processing
around the model call, not as system-prompt instructions the model is trusted to follow.
