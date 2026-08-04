# CareConnect — Build Plan

This document maps the build to the section numbers of *Build Specification — CareConnect*
(referred to below as §1–§21). It records the architecture, the decisions taken and why, and
the phase order.

See the root [`README.md`](../README.md) for the product overview, current status, and roadmap
summary — including "Repository structure," which reflects what's actually built today. This
document describes the intended architecture and stays stable as implementation proceeds.

**Status: Phase 4 (AI companion & safety) complete.** Phases 0-4 are implemented and tested: auth,
the permission spine, medication management, wellness, and now the AI companion. The safety pipeline
(§18) is real code, not prompt engineering — `classifyInput()`, `validateOutput()`, `toneDirective()`,
and `escalation.config.ts` are pure functions in `packages/core/src/safety`, backed by 141 tests.
`CRISIS` and `DOSAGE_CHANGE` inputs never reach a model at all; they resolve to a fixed response
before "context retrieval" is even entered. Writing the adversarial suite caught five real bugs in
the classifier/validator (contractions, verb tenses, apostrophes, filler-word gaps) — evidence the
suite is doing its job, not just padding a count. The provider fallback chain
(`packages/core/src/ai/chain.ts`) is unit-tested with fakes; the concrete Workers AI / Groq fetch
calls (`apps/api/src/ai/providers.ts`) are written to spec but unverified against a live endpoint,
since no environment this project has run in holds real API keys — what's verified live, end to end
against seeded data, is every safety-critical path: classification, output validation, the
fall-through to scripted responses, tone adaptation from stored mood, escalation-event creation, and
the audit trail. Companion conversations are unconditionally self-only — no `DataCategory` exists
for them, confirmed live against a buddy holding three other broad grants. Phase 5 (human layer —
buddy invites, messaging, coach data model) is next.

---

## 1. Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Primary client | **Expo (React Native)** | The product itself. Native camera (§4), on-device scheduled notifications (§13), text-to-speech (§12). |
| Secondary client | **Next.js console** | Admin/developer visibility and the coach dashboard (§10). Deliberately read-mostly. |
| Backend | **Hono**, dual-runtime, single API | Forces a real API boundary; both clients consume the same contract. Only the API touches the database. Same codebase deploys to a Node host or to Cloudflare Workers. |
| Database | **Postgres (Neon)** via Prisma's Neon serverless driver adapter | §21 lists "database schema" as a deliverable; `schema.prisma` is one legible artifact. One schema, one migration history, one seed script regardless of which runtime is serving requests. |
| Auth | **JWT access + refresh, PBKDF2 (WebCrypto) password hashing** | Cookie sessions are awkward from React Native. PBKDF2 via `crypto.subtle` runs unmodified on both Node and Workers; argon2's reference implementations are native Node bindings that don't run on Workers. |
| AI | **Free-tier providers with a fallback chain** | Cost. See §4 of this document for the safety consequence. |
| Scope order | **11 Essentials (§19) first** | §19 explicitly prefers a working MVP over broad shallow integration. |

Satisfying §21's "responsive mobile/desktop layouts": mobile is the native app, desktop is the
console. Expo Web additionally provides a browser-openable build of the real app as a live-demo
fallback.

### 1.1 Dual-runtime API

`apps/api` is written to run unmodified on either a Node host (Render/Railway/Fly) or as a
Cloudflare Worker, chosen at deploy time rather than baked into the code. Two constraints make this
possible:

- **Database access over HTTP, not raw TCP.** Cloudflare Workers cannot open a raw TCP socket, which
  rules out a standard `pg` connection. Prisma's Neon serverless driver adapter speaks HTTP/WebSocket
  instead, so the same Prisma client code runs on both runtimes against the same Postgres database.
  SQLite/D1 remains an option for a Workers-only deployment later, but a single Postgres database
  everywhere is simpler while both runtimes are in play.
- **Password hashing without a native dependency.** PBKDF2 via `crypto.subtle` (WebCrypto) runs
  identically on Node and Workers. It's a weaker KDF than argon2 taken alone, so it's used at a high
  iteration count (≥600,000, current OWASP guidance) alongside the existing strong-password-policy
  requirement (§14).

---

## 2. Repository layout

```
careconnect/
  apps/
    mobile/          Expo (React Native) — the real app, all 18 screens (§16)
    console/         Next.js — admin/dev + coach dashboard (§10)
    api/             Hono, dual-runtime (Node or Cloudflare Workers) — the only process that touches the database
  packages/
    core/            domain logic, pure TypeScript, no I/O
      policy/        permission engine (§10, §14)
      doses/         dose state machine + adherence math (§5)
      safety/        AI guardrails, input and output (§15, §18)
      ai/            provider abstraction + fallback chain
    contracts/       zod schemas + typed client, shared by both clients
    tokens/          design tokens including the accessibility scale (§12)
  docs/
    BUILD_PLAN.md    this file
```

`packages/core` is pure and I/O-free by rule. Every constraint the specification cares about —
who may read what, when a dose becomes *missed*, what the AI may never say — lives there, is
unit-testable without a database, and is shared identically by both clients.

This satisfies §18's modular-architecture requirement: authentication, profiles, medication data,
wellness data, AI services, buddy system, coach system, notifications, permissions, analytics and
security are separate modules rather than layers of one application.

---

## 3. Cross-cutting design decisions

### 3.1 Permissions are a policy engine, not a column (§10, §14)

§10 defines four tiers — Private, Buddy, Coach, Healthcare Professional — but a tier is a label on
data, not a decision procedure. The model is a grant matrix:

```
(owner, grantee, data_category) -> access level
```

resolved by a single `can(actor, subject, category, action)` function that **every** read of health
data passes through, server-side. No role checks in components.

Open questions this design settles, which the specification leaves implicit:

- Buddy visibility is **per-buddy**, not one shared bucket — §9 requires users to "control exactly
  what information their buddy can see." The **default** grant for a newly accepted buddy is clinical
  detail: medication names, adherence events (taken/skipped/missed), and wellness metrics. Always
  private regardless of buddy grant: AI companion conversation content, and any check-in entry the
  user marks private. Because the default is broader than §9's own example ("Alex hasn't completed
  today's check-in"), the per-buddy narrowing control is not optional polish — it is the safety valve
  that makes the default acceptable, and it ships in the same phase as the grant itself (Phase 1 /
  Phase 5), not as a later add-on.
- Revoking a coach ends future access; anything already exported is recorded in the audit log
  rather than pretended to be retractable.
- A single row type can span two categories, resolved per-row rather than per-table. `HealthMetric`
  (§6) holds 11 metric types under one model, but `MOOD` and the other ten are independently
  grantable — `metricCategoryFor(type)` (`packages/core/src/wellness`) picks the category per row.
  A request spanning multiple categories (e.g. "all my metrics") isn't all-or-nothing: `gate.ts`
  exposes both a throwing `assertCanView()` for single-category endpoints and a non-throwing
  `canViewCategory()` for these, so the caller returns whichever categories the actor actually holds
  instead of a 403 that hides data the actor is entitled to.

Sensitive actions append to an immutable audit log (§14).

### 3.2 Doses are materialised rows, not a cron string (§5)

§5 requires five states: taken, skipped, missed, snoozed, unknown. Two of those are *time-derived*,
not user actions — a dose becomes **missed** when its window closes untouched. That requires
`DoseInstance` rows generated ahead of time from a `ScheduleRule`, not a medication row with a
recurrence expression evaluated on read. Without this, the adherence percentages in §5 cannot be
computed honestly.

### 3.3 The scanner cannot bypass verification (§4, §18)

§18 mandates `Camera → OCR → AI extraction → User verification → Medication record → Reminder`
and forbids `Camera → AI → automatic medical instructions`.

Enforced structurally: extraction writes to a `MedicationDraft` table. A draft cannot become a
`Medication` — and therefore cannot generate a reminder — without an explicit confirmation record.
This is a schema constraint, not a screen the user could skip. The verification screen carries the
§4 wording: *"Please verify this information against your prescription or medication label."*

The draft table lands in Phase 2, before OCR exists, so the safe path is the only path from the start.

### 3.4 Mood is reported, never inferred (§8)

§8 requires the companion to adapt tone to the user's state, and simultaneously forbids claiming to
detect emotional state from facial expressions, voice, or text. Therefore tone adaptation reads
**only** the value the user selected in their most recent check-in (§7). No sentiment analysis of
message text anywhere in the system.

### 3.5 Accessibility is a token layer, not parallel screens (§2, §12)

Senior/Accessibility Mode swaps type scale, touch-target size, contrast, and motion at the root of a
single component tree. Duplicating 18 screens into "senior versions" guarantees the two copies
diverge. Read-aloud, voice medication confirmation, and confirmation dialogs for important actions
attach to the same components.

### 3.6 The check-in flow is a function, not a form (§7)

§7 gives one worked example (mood, via a 5-emoji scale) and otherwise only says to ask "only
relevant questions rather than forcing users through a long questionnaire" — it doesn't specify the
branching rule. `nextCheckInQuestion(answers, context)` (`packages/core/src/wellness`) is one
deliberate, testable implementation of that requirement, not the only possible one: mood is always
first; a low mood (1-2 of 5) branches toward understanding why (stress, pain, energy) and closes
early; a neutral-or-better mood branches toward the routine-tracking fields instead (energy, sleep
quality, medication adherence — skipped entirely if the user has no active medication — physical
activity). The function is pure and stateless: the API calls it once per answer submitted, and the
client just keeps asking until it returns `null`. This is what makes the flow read as a short
conversation rather than a fixed-length form.

---

## 4. AI provider strategy — and its safety consequence

Providers are accessed over REST, so hosting stays independent of any one vendor.

| Role | Primary | Fallback | Last resort |
| --- | --- | --- | --- |
| Companion chat (§8) | Cloudflare Workers AI | Groq free tier | Scripted responses |
| Label vision (§4) | Free vision model | Tesseract.js on-device | Manual entry |

The last-resort column exists so a live demonstration survives an exhausted free tier.

**Consequence.** Free open-weight models follow safety instructions considerably less reliably than
frontier models. A system prompt reading "never diagnose" is, to them, a suggestion. Therefore the
§15 prohibitions are implemented as **deterministic code on both sides of the model call**, exactly
as §18's pipeline implies:

```
User input
  -> input classifier      intercepts diagnosis-seeking, dosage-change requests, crisis language
  -> context retrieval     user's own logs only, read-only
  -> model call
  -> output validator      rejects/rewrites diagnostic claims, injects required disclaimers
  -> User
```

**As implemented (Phase 4), the tool surface is narrower than "read-only": it's zero.** The companion
has no tool-calling surface at all — it cannot invoke anything, read or write. Context (mood, recent
adherence, active medication names) is gathered server-side and handed to the model as plain text
*before* the call (`apps/api/src/ai/context.ts`), rather than the model requesting it via a read
tool. This is what makes §12's "do not allow voice commands to modify prescriptions" and §15's
"never change medication dosage" true by construction: there's no tool for the model to misuse
because there's no tool at all, which is a stronger guarantee than a read-only tool would have been.

`CRISIS` and `DOSAGE_CHANGE` inputs never reach the model or the context-retrieval stage — they
resolve to a fixed, pre-reviewed response the moment the classifier tags them, before "AI response"
is ever entered. `GENERAL` and `DIAGNOSIS_SEEKING` are the only categories that reach a model, and
both are still passed through the output validator afterward.

Escalation (§11) is triggered by the input classifier, not by the model's judgement. Emergency
guidance is **configurable per deployment**: one config module (`packages/core/src/safety/escalation.config.ts`)
holds a region field and any hotline numbers, defaulting to neutral wording ("contact your local
emergency services or a healthcare professional") when the region is unset. A deployment sets the
region via environment variable to get localized numbers without a code change.

Free-tier limits and model IDs were verified directly ahead of Phase 0 closing; see
`docs/AI_PROVIDERS.md`. The concrete provider calls (`apps/api/src/ai/providers.ts`) are written to
each API's documented contract but have not been exercised against a live endpoint in any
environment this project has run in — see the `**` note in README "Platform constraints."

---

## 5. Phase plan

### Phase 0 — Foundation (§18, §21)
- Monorepo, TypeScript config, linting, CI.
- Prisma schema for all entities; migrations.
- Seed data (§21): 3 patients, 2 buddies, 1 coach, medications, 30 days of history — enough that
  charts and adherence figures are non-trivial on first launch.
- Authentication: registration, login, password policy, session management (§14).
- Verify free-tier AI limits; lock providers.

**Delivers Essential 1 (user authentication).**

### Phase 1 — Permission spine (§10, §14)
- Grant matrix and the `can()` gate; every health-data read routed through it.
- Append-only audit log for sensitive actions.
- Consent, data export, and data deletion endpoints (§14).

**Delivers Essential 11 (privacy controls).**

### Phase 2 — Medication (§4, §5, §13)
- `Medication`, `ScheduleRule`, materialised `DoseInstance`.
- State machine: `pending → taken | skipped | snoozed`; `missed` derived at window close; `unknown`
  as the terminal fallback.
- Adherence rollups: today / this week / this month (§5).
- Manual medication entry, dosage, schedule, start/end dates, notes, history (§4).
- On-device scheduled local notifications (§13).
- `MedicationDraft` table and confirmation gate (§3.3 above).

**Delivers Essentials 3, 4, 5 (medication creation, reminders, history).**

### Phase 3 — Wellness (§6, §7)
- Health metrics for all 11 types in §6, each carrying a mandatory
  `source: SELF_REPORTED | DEVICE` so §6's separation requirement is visible in the UI.
- Daily check-in (§7) with adaptive branching — relevant follow-ups only, never a long questionnaire.

**Delivers Essentials 6, 7 (wellness check-ins, health metrics).**

### Phase 4 — AI companion and safety (§8, §11, §15, §18)
- The full pipeline from §4 of this document.
- Read-only tool boundary.
- Tone adaptation from the stored check-in value only (§3.4 above).
- Escalation UI for potentially urgent situations (§11).
- **Adversarial test suite**: asserted response properties for diagnosis-seeking, dosage-change,
  stop-medication, and crisis inputs. This is the primary evidence that §15 holds.

**Delivers Essential 8 (AI wellness companion).**

### Phase 5 — Human layer (§9, §10)
- Buddy invitation, accept/decline, messaging, encouragement, accountability goals, check-in
  requests — every read gated by Phase 1.
- Coach entity and authorisation modelled here; the coach dashboard UI lands in Phase 8.

**Delivers Essential 9 (buddy system).**

### Phase 6 — Accessibility (§2, §12)
- Token layer: type scale, touch targets, contrast, reduced motion.
- Text-to-speech read-aloud; confirmation dialogues for important actions.

**Delivers Essential 10 (accessibility mode).**

### Phase 7 — Dashboard and notifications (§3, §13)
- The dashboard card stack answering §3's question: *"What do I need to do for my health today?"*
- Notification preferences: quiet hours, frequency, per-category toggles (§13).

**Delivers Essential 2 (dashboard).**

> **All 11 Essentials from §19 complete and demoable end-to-end at this point.**

### Phase 8 — Console (§10)
Next.js admin/developer views and the coach dashboard: authorised patient information, wellness
trends, adherence statistics, messaging, check-in scheduling, notes, non-medical wellness goals.

### Phase 9 — Advanced (§19)
Medication label OCR (§4) · voice interaction (§12) · charts and trend analysis (§5) · AI-generated
wellness summaries · exportable health reports (§5) · mock wearable integration (§6).

### Phase 10 — Polish (§17, §21)
Empty, loading and error states · medical/wellness disclaimers · README with setup instructions and
architecture overview.

---

## 6. Platform constraints on record

- **Medication reminders are genuinely functional.** Expo schedules local notifications on-device
  with no push server and no APNs/FCM credentials, so §13 is real rather than simulated.
- **Voice input probably requires an Expo development build**, not Expo Go, because speech-to-text
  needs a native module. Text-to-speech (§12 read-aloud) works everywhere. Voice input is an
  Advanced item (§19) in Phase 9, so this blocks nothing on the Essentials path.
- **This is a prototype, not compliant infrastructure.** Audit logging, encryption and RBAC are in
  scope per §14, but the deployment is not HIPAA- or GDPR-compliant. The README will say so plainly
  rather than implying clinical readiness.

---

## 7. Scope discipline

§19 prefers a fully functional MVP over broad integration, and §21 asks for functionality,
usability, accessibility, privacy and safety ahead of feature count. The Advanced items that most
serve §20's differentiation thesis — *medication adherence, wellness monitoring, AI assistance and
human support in one patient-centred system* — are the coach dashboard and trend analysis. Wearable
integration is explicitly mockable and adds least to that thesis; it is last.
