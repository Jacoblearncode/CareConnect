# CareConnect

**AI-Assisted Health & Wellness Support Platform**

CareConnect is a patient-centered health and wellness coordination app that brings medication
management, remote wellness monitoring, an AI wellness companion, and human-to-human support
(buddies and health coaches) into one place.

> CareConnect supports users — it does not replace doctors, pharmacists, therapists, or emergency
> services. It does not diagnose disease, prescribe medication, or independently determine medical
> treatment. See [AI Safety](#ai-safety) below.

This repository currently contains the **architecture and build plan**; implementation proceeds in
phases described in [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md). The full source specification is
*Build Specification — CareConnect*, referenced throughout as §1–§21.

---

## Status

**Phases 0-6 complete: auth, permissions, medication, wellness, AI companion, the human layer
(buddies + coach data model), and now accessibility are all implemented, tested, and
live-verified.** Phase 6 is also the first phase with a real UI: `apps/mobile` (Expo/React Native)
is scaffolded with a working login → dashboard → settings flow, verified in-browser end to end
against the live API. See [Roadmap](#roadmap) for phase status.

---

## Product vision

CareConnect combines seven things into one system (§1):

- Medication management
- Remote wellness monitoring
- An AI wellness companion
- Human-to-human buddy support
- Health coaching
- Accessible interfaces for older adults
- Personal health records and progress tracking

**Differentiator (§20):** this is not another medication reminder. The value is in connecting
medication adherence, wellness monitoring, AI assistance, and human support into a single
patient-centered system — the AI handles repetitive organization and conversational support, while
humans stay central to meaningful care and accountability.

### Target users (§2)

| Group | Needs |
| --- | --- |
| **Patients** | Managing medications, chronic conditions, recovery, or general wellness. |
| **Older adults** | Large fonts, high contrast, large touch targets, simple navigation, voice interaction, minimal steps, clear notifications, optional caregiver/family access. |
| **Support network** | Friends, family, buddies, and human health coaches providing encouragement and accountability. |

---

## Architecture

### Two clients, one API

| App | Role | Why |
| --- | --- | --- |
| **`apps/mobile`** (Expo / React Native) | The product. Login → dashboard → settings scaffolded as of Phase 6 (3 of 18 screens, §16); the rest land as their phases do. | Native camera for label scanning (§4), on-device scheduled notifications with no push server (§13), text-to-speech (§12) — the read-aloud button on the dashboard uses this today via `expo-speech`. Expo Web also gives a browser-openable fallback build for live demos. |
| **`apps/console`** (Next.js) | Admin/developer visibility and the coach dashboard (§10). Deliberately read-mostly. | Satisfies §21's "responsive mobile/desktop layouts" honestly: mobile is native, desktop is the console — rather than one codebase pretending to be both. |
| **`apps/api`** (Hono, dual-runtime) | The only process that touches the database. Both clients consume the same contract. Deploys unmodified to either a Node host or Cloudflare Workers. | Forces a real API boundary instead of one client reaching into the database directly. |

### Shared packages

```
packages/
  core/            domain logic, pure TypeScript, no I/O
    policy/        permission engine (§10, §14)
    doses/         dose state machine + adherence math (§5)
    safety/        AI guardrails, input and output (§15, §18)
    ai/            provider abstraction + fallback chain
    human/         buddy/coach default grants, non-medical goal-content heuristic (§9, §10)
  contracts/       zod schemas + typed client, shared by both apps
  tokens/          design tokens: type scale, touch targets, contrast, motion (§12) — implemented
```

`packages/core` is pure and I/O-free by rule: every constraint the specification cares about — who
may read what, when a dose becomes *missed*, what the AI may never say — lives there, is
unit-testable without a database, and is shared identically by both clients. This is also what
satisfies §18's requirement to keep authentication, profiles, medication data, wellness data, AI
services, buddy system, coach system, notifications, permissions, analytics and security as
separate modules.

### Data & auth

- **Postgres (Neon), accessed via Prisma's Neon serverless driver adapter.** `schema.prisma` is a
  single legible artifact for the "database schema" deliverable in §21. The driver adapter speaks
  HTTP/WebSocket rather than raw TCP, which is what lets the same Prisma client run on both a Node
  host and on Cloudflare Workers, where raw TCP sockets aren't available — one database, one
  migration history, one seed script, regardless of which runtime is serving a given deployment.
- **JWT access + refresh tokens.** Cookie-based sessions are awkward to drive from React Native, so
  bearer tokens are used across both clients.
- **Password hashing via PBKDF2 (WebCrypto `crypto.subtle`), not argon2.** argon2's reference
  implementations are native Node bindings and don't run on Workers; WebCrypto needs no native
  dependency and runs identically on both runtimes. It's a weaker KDF than argon2 in isolation, so
  it's used at a high iteration count (≥600,000, current OWASP guidance) alongside the strong
  password policy already required by §14.

---

## Key design decisions

These are the decisions most likely to be questioned, and why they were made this way. Full detail
is in [`docs/BUILD_PLAN.md` §3](docs/BUILD_PLAN.md#3-cross-cutting-design-decisions).

1. **Permissions are a policy engine, not a column (§10, §14).** Access is a grant matrix —
   `(owner, grantee, data_category) → access level` — resolved by one `can()` function that every
   health-data read passes through server-side. Buddy visibility is per-buddy, not one shared
   bucket, because §9 requires users to control exactly what a buddy can see. The **default** grant
   for a newly accepted buddy is clinical detail — medication names and adherence events, wellness
   metrics — not just engagement signals; AI companion conversation content and notes marked private
   stay private regardless. Because that default is broader than §9's own example, per-buddy
   narrowing ships alongside the grant itself, not as a later add-on — it's the safety valve that
   makes the default acceptable. Every sensitive action is appended to an immutable audit log.

2. **Doses are materialized rows, not a cron string (§5).** Two of the five required states —
   *missed* and, implicitly, *unknown* — are time-derived rather than user actions. A dose becomes
   missed when its scheduled window closes untouched. This requires generating `DoseInstance` rows
   ahead of time from a `ScheduleRule`, so adherence percentages can be computed honestly.

3. **The scanner cannot bypass verification (§4, §18).** The required pipeline is
   `Camera → OCR → AI extraction → User verification → Medication record → Reminder`, and the
   forbidden shortcut is `Camera → AI → automatic medical instructions`. This is enforced at the
   schema level: OCR output writes to a `MedicationDraft` table, and a draft cannot become a
   `Medication` — and therefore cannot generate a reminder — without an explicit confirmation
   record. It's a structural constraint, not a screen a user (or a bug) could skip.

4. **Mood is reported, never inferred (§8).** The companion adapts its tone using only the value
   the user selected in their most recent check-in. The specification explicitly forbids claiming
   to detect emotional state from facial expressions, voice, or text, so no sentiment analysis of
   message content exists anywhere in the system.

5. **Accessibility is a token layer, not parallel screens (§2, §12).** Senior/Accessibility Mode
   swaps type scale, touch-target size, contrast, and motion at the root of one component tree.
   Duplicating 18 screens into "senior versions" would guarantee the two copies drift apart over
   time. `packages/tokens` (`getTokens()`) makes this concrete and testable: the Accessibility Mode
   type scale is strictly larger at every role, its touch targets exceed the WCAG 2.5.5 minimum
   rather than merely meeting it, its color pairs clear WCAG **AAA** (7:1) rather than just AA
   (4.5:1) — including "muted" text, which stays dark rather than going lighter, since a lighter
   secondary tone is exactly the kind of low-contrast text this mode exists to eliminate — and
   motion is disabled outright rather than merely shortened. `apps/mobile`'s
   `AccessibilityProvider` reads the mode from `User.accessibilityMode` and re-renders the whole
   tree from it; toggling it in Settings both restyles the app immediately and persists to the
   account via `PATCH /auth/me`, verified live in-browser.

### AI provider strategy

To stay on free tiers, CareConnect uses a provider fallback chain rather than one paid vendor:

| Role | Primary | Fallback | Last resort |
| --- | --- | --- | --- |
| Companion chat (§8) | Cloudflare Workers AI | Groq free tier | Scripted responses |
| Label vision (§4) | Free vision model | Tesseract.js on-device | Manual entry |

The last-resort column exists so a live demo survives an exhausted free tier mid-presentation.
Providers are called over REST, so hosting is not locked to any one vendor.

**Consequence for safety design:** free open-weight models follow safety instructions considerably
less reliably than frontier models — a system prompt saying "never diagnose" is, to them, a
suggestion. So the §15 prohibitions are implemented as **deterministic code**, not prompt wording,
on both sides of the model call:

```
User input
  → input classifier      intercepts diagnosis-seeking, dosage-change requests, crisis language
  → context retrieval     the user's own logs only, read-only
  → model call
  → output validator      rejects/rewrites diagnostic claims, injects required disclaimers
  → User
```

The companion's tool surface, as built, is narrower than "read-only": it's **zero**. It cannot invoke
anything, read or write — context (mood, recent adherence, active medication names) is gathered
server-side and handed to the model as plain text before the call, rather than the model requesting
it via a tool. That's what makes "never change medication dosage" (§15) and "do not allow voice
commands to modify prescriptions without explicit confirmation" (§12) structurally true rather than
dependent on the model behaving — there's no tool for it to misuse because there's no tool at all.

---

## AI safety

Per §15, the AI must never: diagnose, prescribe, change medication dosage, tell a user to stop
prescribed medication, fabricate medical facts, or create false confidence. It must always:
distinguish general wellness information from professional medical advice, encourage professional
consultation when appropriate, and communicate uncertainty clearly.

Per §11, AI support and human support are kept visibly distinct. Where a situation may need
professional attention, the AI directs the user toward appropriate care rather than attempting
diagnosis or treatment — for example:

> "I can't diagnose this. Because you've reported these symptoms, it would be reasonable to speak
> with a healthcare professional."

Escalation guidance is **configurable per deployment**: one config module holds a region field and
any hotline numbers, defaulting to neutral wording ("contact your local emergency services or a
healthcare professional") when unset, so a deployment can add localized numbers via environment
variable without a code change.

The primary evidence that these rules hold is an **adversarial test suite** (Phase 4, 141 tests
across `packages/core/src/safety`) asserting response properties for diagnosis-seeking,
dosage-change, stop-medication, and crisis-language inputs — run against the deterministic
classifier/validator described above, not against the model in isolation. It's genuinely
adversarial: writing it caught five real classifier/validator bugs (contraction handling, verb
tenses, apostrophes in disease names, filler-word gaps) that a smaller or less deliberately
hostile test set would have missed. `CRISIS` and `DOSAGE_CHANGE` inputs never reach a model at
all — they resolve to a fixed, pre-reviewed response before the "AI response" pipeline stage is
even entered, which is stronger than trusting a model (even a validated one) to decline correctly
every time.

---

## Privacy & permissions

Per §14, health information is treated as sensitive by default:

- Secure authentication, strong password requirements, session management, role-based access
  control, encryption where appropriate, secure API communication.
- Minimal data collection, explicit consent, data export, and data deletion.
- Audit logs for sensitive actions.
- No private health information in client-side logs, URLs, public API responses, or debug messages.

Per §10, four access tiers exist for any piece of information: **Private** (only the user),
**Buddy** (selected wellness information), **Coach** (authorized health/wellness information), and
**Healthcare Professional** (only what's explicitly shared for care purposes). Users must
explicitly authorize Coach and Healthcare Professional access.

**This is a prototype, not compliant infrastructure.** Audit logging, encryption, and RBAC are
implemented per §14, but the deployment is not HIPAA- or GDPR-certified. This will be stated
plainly wherever the app might otherwise imply clinical-grade compliance.

---

## Roadmap

Full detail, including which spec section each phase satisfies, is in
[`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md). Summary:

| Phase | Delivers | Status |
| --- | --- | --- |
| 0 — Foundation | Monorepo, Prisma schema, seed data, auth | **Complete** |
| 1 — Permission spine | Grant matrix, audit log, consent/export/delete | **Complete** |
| 2 — Medication | CRUD, dose state machine, adherence, reminders, OCR-draft gate | **Complete**\* |
| 3 — Wellness | Health metrics (11 types), adaptive daily check-in | **Complete** |
| 4 — AI companion & safety | Full safety pipeline, escalation, adversarial test suite | **Complete**\*\* |
| 5 — Human layer | Buddy invites, messaging, accountability; coach data model | **Complete** |
| 6 — Accessibility | Token-layer Senior/Accessibility Mode, TTS, confirmations | **Complete** |
| 7 — Dashboard & notifications | "What do I need to do today?" dashboard, quiet hours | Not started |
| **→ 11 Essentials (§19) complete and demoable end-to-end** | | |
| 8 — Console | Admin/dev views, coach dashboard | Not started |
| 9 — Advanced | OCR, voice interaction, charts/trends, AI summaries, exports, mock wearables | Not started |
| 10 — Polish | Empty/loading/error states, disclaimers, this README | Not started |

Essentials are built end-to-end and properly, before any Advanced item is started (§19).

### Platform constraints on record

- **\*Phase 2's "reminders" is the server side only, still.** Every dose a schedule implies is a
  real, time-windowed `DoseInstance` row — the data a reminder would fire from is correct and
  complete. `apps/mobile` exists as of Phase 6, but nothing in it schedules an on-device
  notification yet — that's Phase 7's "Notification preferences: quiet hours, frequency,
  per-category toggles," the natural place to wire `expo-notifications` up against real
  preferences rather than firing unconditionally. When it lands: Expo schedules local
  notifications on-device with no push server or APNs/FCM credentials required, so this isn't
  blocked on any infrastructure decision.
- **Voice input likely needs an Expo development build**, not Expo Go, because speech-to-text
  needs a native module. Text-to-speech (read-aloud, §12) is real today — the dashboard's "Read
  today's summary aloud" button calls `expo-speech`, verified in a live browser session (Expo Web
  wraps the browser's own `SpeechSynthesis` API; the native builds use the OS TTS engine through
  the same `expo-speech` call, unverified only in the sense that no physical device or simulator
  has run it in this environment — see the console warning about React Native DevTools, which is
  an unrelated Electron sandboxing quirk of running Expo's CLI as root in this container, not an
  app bug). Voice *input* is an Advanced item (Phase 9), so this blocks nothing on the Essentials
  path.
- **\*\*Phase 4's provider calls are reviewed but not live-verified.** No environment this project
  has run in has a real `CF_ACCOUNT_ID` or `GROQ_API_KEY` configured, so `createWorkersAiProvider`
  and `createGroqProvider` (`apps/api/src/ai/providers.ts`) are written against each API's
  documented REST contract but have never round-tripped a real request. What *is* verified
  end-to-end, live, against real seeded data: every safety-critical code path — the classifier, the
  output validator, the fallback-to-scripted-response behavior when a provider is unconfigured or
  fails, tone adaptation, escalation, and audit logging. Add real keys and re-test before treating
  the live model calls themselves as verified.

### Decision log

Four decisions were open after the initial architecture pass and are now resolved:

| Decision | Resolution |
| --- | --- |
| **API hosting** | Dual-runtime: `apps/api` deploys unmodified to a Node host or to Cloudflare Workers. Enabled by Prisma's Neon serverless driver adapter (HTTP/WebSocket, not raw TCP) and PBKDF2/WebCrypto password hashing (no native binding). See [Data & auth](#data--auth). |
| **Coach dashboard priority** | Stays in Phase 8, per §19's own categorization. The data model and authorization landed in Phase 5 (directory, requests, notes, non-medical goals); only the dashboard UI is later. |
| **Buddy visibility granularity** | Default grant is **clinical detail** (medication names, adherence events, wellness metrics), not just engagement signals. AI companion conversations and notes marked private stay private regardless. Because this default is broader than §9's own example, per-buddy narrowing ships in the same phase as the grant itself (Phase 1/5), not later. |
| **Emergency escalation copy** | Configurable per deployment. One config module holds a region field and hotline numbers, defaulting to neutral wording when unset. |

---

## Getting started

`apps/api` and its auth flow are functional as of Phase 0; `apps/mobile` joined as of Phase 6.
`apps/console` doesn't exist yet — this section covers what's runnable today and will grow as each
app lands.

### Prerequisites

- Node.js ≥ 20, [pnpm](https://pnpm.io) 10.x (`corepack enable` will pick up the pinned version
  from `package.json`)
- A Postgres 16 database — a local install/cluster, or a free [Neon](https://neon.tech) project

### 1. Install

```bash
pnpm install
```

The Prisma client's postinstall step needs to run once; if pnpm prompts about ignored build
scripts, approve `@prisma/client`, `@prisma/engines`, and `prisma` (already pre-approved via the
`pnpm.onlyBuiltDependencies` field in the root `package.json`, so a fresh clone shouldn't need to).

### 2. Configure the API

```bash
cd apps/api
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — point at your local Postgres or a Neon connection string.
- `JWT_ACCESS_SECRET` — generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- The AI provider keys are optional — see [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md). Leaving
  them blank is fine until Phase 4.
- `CORS_ORIGINS` is optional; unset defaults to `*`. Auth is bearer-token, not cookies, so a
  wildcard doesn't hand out an ambient credential the way it would for a cookie-authenticated API —
  but set this to your actual client origin(s) for a real deployment.

### 3. Migrate and seed the database

```bash
pnpm db:migrate   # applies apps/api/prisma/migrations
pnpm db:seed      # wipes and regenerates demo data
```

Seeding creates three patients, two buddies, and one coach — 30 days of medication, wellness, and
check-in history each — printed at the end with their shared demo password. See
`apps/api/prisma/seed.ts` for the exact personas.

### 4. Run the API

```bash
pnpm dev:api
```

Starts `apps/api` on `http://localhost:8787` (`entry.node.ts`; see [Architecture](#architecture)
for the Cloudflare Workers entry point used in production). Confirm it's up:

```bash
curl http://localhost:8787/health
# {"status":"ok"}
```

The auth flow is live: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` (bearer token),
`PATCH /auth/me` (body `{"accessibilityMode": true|false}` — the one profile field with a Settings
screen behind it, added in Phase 6), `POST /auth/refresh` (rotates the refresh token — the old one
stops working), and `POST /auth/logout`.

The permission spine (Phase 1) is also live:

- `GET /permissions/grants` — who can see my data, and what (the owner side of the grant matrix)
- `GET /permissions/shared-with-me` — what I can see of other people's data (the grantee side)
- `PUT /permissions/grants` / `DELETE /permissions/grants?granteeId=&category=` — set or revoke a
  grant; requires an active buddy or coach relationship with the grantee first
- `GET /privacy/audit-log` — a user's own audit trail
- `GET` / `POST /privacy/consent` — read or set consent by type
- `POST /privacy/export` — a synchronous JSON export of everything the user owns
- `DELETE /privacy/account` (body `{"confirm":"DELETE"}`) — anonymizing account deletion: personal
  health data is hard-deleted, relationships are marked inactive, identity fields are scrubbed

Medication (Phase 2) is also live:

- `GET/POST /medications`, `GET/PATCH /medications/:id` — list/create/view/update; creating
  generates the next 30 days of `DoseInstance` rows from the schedule
- `GET /medications/:id/doses`, `GET /doses/today` — dose history and today's due doses
- `POST /doses/:doseId/record` (body `{"status": "TAKEN"|"SKIPPED"|"SNOOZED"|"UNKNOWN"}`) — TAKEN
  and SKIPPED are terminal; a system-derived MISSED can still be corrected (late logging); SNOOZED
  extends the window 15 minutes
- `GET /medications/adherence` — today/week/month adherence, gated by the narrower `ADHERENCE`
  category rather than `MEDICATIONS` (a coach can know the rate without knowing the drug)
- `GET/POST /medications/drafts`, `POST /medications/drafts/:id/confirm|discard` — the OCR
  verification gate (§3.3): confirming requires the full medication payload again, so nothing a
  scan extracted ever reaches a `Medication` row without a user resubmitting it, edits included
- All of the above accept `?userId=` to view another user's data as a buddy/coach — routed through
  `assertCanView()` per request, category by category

Wellness (Phase 3) is also live:

- `GET/POST /wellness/metrics`, `DELETE /wellness/metrics/:id` — all 11 metric types from §6, each
  carrying a mandatory `source: SELF_REPORTED | DEVICE`. A metric's required permission category
  depends on its own `type`: `MOOD` entries need a `MOOD` grant, everything else needs
  `WELLNESS_METRICS` — a buddy or coach can be given one without the other, so an "all metrics"
  request returns whichever categories they actually hold rather than an all-or-nothing 403
- `GET /checkins/today`, `POST /checkins/today` (body `{"field": "...", "value": 1-5}`) — the daily
  check-in (§7), answered one field at a time. `mood` is always first; a low mood (1-2) branches to
  `stress`/`pain`/`energy` then closes, a better mood branches to the routine-tracking fields
  instead (skipping `medicationAdherence` if the user has no active medications) — never every
  question every day. Each response includes `nextQuestion`, so the client just keeps asking until
  it's `null`
- `GET /checkins` — history, gated by the `CHECKINS` category

AI companion (Phase 4) is also live — see [AI safety](#ai-safety) for the pipeline itself:

- `POST /companion/messages` (body `{"conversationId"?: "...", "content": "..."}`) — send a message;
  omit `conversationId` to start a new conversation. Response includes `category` (the classifier's
  verdict) and `escalated`
- `GET /companion/conversations`, `GET /companion/conversations/:id/messages` — self-only, always.
  No `?userId=` parameter exists anywhere in this route file: there's no `DataCategory` for AI
  conversations, and per README "Buddy visibility," companion content stays private regardless of
  any grant — verified live against a buddy holding three other broad grants, still 403
- Every assistant message stores `safetyFlags` (which classifier patterns matched, whether output
  validation passed) — a per-message, inspectable audit trail, not just a pass/fail log line
- Tone genuinely comes from the stored check-in `mood`, not the message: sending the identical
  message with `mood: 1` vs `mood: 5` on file produces the spec's two different worked-example
  openers verbatim

The human layer (Phase 5) is also live:

- `GET/POST /buddies/invites` — send an invite by `toUserId` or `toEmail`; an email invite before
  the invitee has an account is reconciled automatically at `POST /auth/register`
- `POST /buddies/invites/:id/accept|decline|cancel` — accept/decline are the recipient's call,
  cancel is the sender's; accepting creates the `BuddyLink` and grants clinical-detail visibility
  (`MEDICATIONS`, `ADHERENCE`, `WELLNESS_METRICS`) **in both directions** — verified live
- `GET /buddies`, `DELETE /buddies/:id` — list active links; removing one sets both directions'
  grants to `NONE` and immediately blocks further messages/goals on that link — verified live
- `GET/POST /buddies/:id/messages` (`type`: `MESSAGE` | `ENCOURAGEMENT` | `CHECKIN_REQUEST`)
- `GET/POST /buddies/:id/goals`, `PATCH /buddies/:id/goals/:goalId` — accountability goals
- `GET /coach/directory` — registered coaches and their profile; `PUT /coach/profile` — a coach's
  own bio/credentials
- `GET/POST /coach/links` — a patient requesting a listed coach activates immediately (the
  patient's own request is the consenting act); a coach inviting a patient lands `PENDING` and
  can't be self-accepted — verified live, a coach calling `accept` on their own invite gets 403
- `POST /coach/links/:id/accept|end` — only the patient can accept; either side can end, which
  revokes the patient → coach grant
- `GET/POST /coach/links/:id/notes` — coach-authored, patient-readable (transparency, not a shared
  thread)
- `GET/POST /coach/links/:id/goals`, `PATCH .../goals/:goalId` — non-medical only:
  `checkGoalContent()` rejects obvious medical language (dosage numbers, "stop taking your
  medication," "diagnose") with a 400 — verified live, and honestly limited (it won't catch a goal
  naming an actual drug, since that would need a drug-name dictionary this project doesn't have)

`apps/mobile` is also live (Phase 6) — a real Expo/React Native app, not a mockup:

```bash
cd apps/mobile
cp .env.example .env    # EXPO_PUBLIC_API_URL, defaults to http://localhost:8787
pnpm install             # from the repo root, if you haven't already
npx expo start --web     # or --android / --ios with a device or simulator attached
```

- **Login → Dashboard → Settings**, all wired to the real API above, not sample data: login calls
  `POST /auth/login`; the dashboard calls `GET /doses/today` and `GET /medications/adherence` and
  posts real `POST /doses/:doseId/record` calls; Settings calls `PATCH /auth/me`.
- **Senior/Accessibility Mode** is a real, working toggle, not a screenshot: `AccessibilityProvider`
  (`src/accessibility/AccessibilityContext.tsx`) re-renders the whole tree from
  `@careconnect/tokens`' `getTokens()` the moment the Settings switch flips, and the switch persists
  the value to the account via `PATCH /auth/me` — verified in a live browser session: type scale,
  touch-target size, and contrast all visibly change, and the new value survives a reload.
- **"Read today's summary aloud"** calls `expo-speech` with a sentence built from the same
  real dose and adherence data on screen — verified to fire without error in a live browser
  session (Expo Web routes it through the browser's `SpeechSynthesis` API).
- **"Mark as taken" is confirmation-gated** (§12 "confirmation dialogs for important actions") by a
  custom `ConfirmDialog` component, not the native `Alert.alert` — the native dialog can't be resized
  to the Accessibility Mode scale, so an important action needed a dialog this app actually controls
  the sizing of. Confirming calls the real `POST /doses/:doseId/record`, and the dose's new status
  round-trips back into the list.
- Metro (the bundler) needed two non-default settings to work in this pnpm monorepo, both in
  `metro.config.js` and both commented in place: `unstable_enableSymlinks` (pnpm's node_modules are
  symlinks) and a custom `resolveRequest` that strips a trailing `.js` before retrying resolution
  (packages/core, contracts, and tokens use the modern TypeScript convention of writing relative
  imports as `./foo.js` pointing at `./foo.ts`, which `tsc`/`vitest` resolve natively but Metro's
  resolver does not).

### 5. Run checks

```bash
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit, every package
pnpm test        # vitest — 199 tests: safety classifier/validator, policy engine, dose math,
                 # check-in branching, provider fallback chain, auth crypto, goal-content
                 # heuristic, accessibility tokens (WCAG contrast math), drift guards
pnpm build       # tsc build, every package
```

CI (`.github/workflows/ci.yml`) runs all of the above against a fresh Postgres service container
on every push and pull request.

### What's not here yet

- `apps/mobile` has 3 of 18 screens (§16) as of Phase 6 — login, dashboard, settings. The other 15
  land alongside the phases that give them something real to show (wellness charts in Phase 9,
  the buddy/coach screens whenever their own phase's UI is scoped, etc.) — see
  `apps/mobile/README.md`. `apps/console` is still unscaffolded.
- On-device notification *scheduling* — Phase 7, see the `*` note under
  [Platform constraints](#platform-constraints-on-record). Text-to-speech read-aloud is live today.
- The coach dashboard UI (Phase 8) — the data model, authorization, and routes behind it are live
  as of Phase 5.
- The AI companion's live provider calls are unverified — see the `**` note under
  [Platform constraints](#platform-constraints-on-record).
- The AI safety adversarial test suite referenced in [AI safety](#ai-safety) is written in Phase 4.

---

## Repository structure

```
careconnect/
  apps/
    mobile/            Expo (React Native) — the product. 3/18 screens (§16) as of Phase 6
      metro.config.js  pnpm-monorepo Metro resolution (symlinks, .js->.ts retry)
      App.tsx          screen router + AccessibilityProvider
      src/api/client.ts        thin fetch wrapper, typed against @careconnect/contracts
      src/accessibility/       AccessibilityProvider — reads @careconnect/tokens
      src/screens/              LoginScreen, DashboardScreen, SettingsScreen
      src/components/ConfirmDialog.tsx   token-sized confirmation modal, not native Alert
    console/           Next.js — admin/dev + coach dashboard (not yet scaffolded, Phase 8)
    api/               Hono, dual-runtime — the only process touching the database
      prisma/
        schema.prisma  full data model, organized by phase, tagged with spec sections
        seed.ts        demo data: 3 patients, 2 buddies, 1 coach, 30 days of history
      src/
        app.ts         runtime-agnostic Hono app factory
        entry.node.ts  Node dev/deploy entry point
        entry.worker.ts  Cloudflare Workers entry point
        db.node.ts / db.worker.ts  Prisma driver-adapter selection per runtime
        policy/gate.ts   DB-backed assertCanView() / canViewCategory() — every data route calls one first
        doses/sweep.ts     closeExpiredDoses() — PENDING/SNOOZED past window -> MISSED
        doses/generate.ts  materializes DoseInstance rows from a ScheduleRule (30-day horizon)
        util/owner.ts       resolveOwnerId() — shared ?userId= resolution for cross-user reads
        routes/auth.ts          register / login / refresh / logout / me / patch-me (accessibilityMode)
        routes/permissions.ts   grants: list / set / revoke
        routes/privacy.ts       audit log, consent, export, account deletion
        routes/medications.ts   medications, doses, adherence, OCR-draft confirmation gate
        routes/wellness.ts      health metrics, adaptive daily check-in
        routes/companion.ts     AI companion messages/conversations, always self-only
        routes/buddies.ts       invites, links, messages, accountability goals
        routes/coach.ts         directory, links, notes, non-medical goals
        ai/companion.ts    the §18 pipeline: classify -> [scripted override | context+model+validate]
        ai/context.ts      read-only context gathering (mood, adherence, active medication names)
        ai/providers.ts    concrete Workers AI / Groq fetch calls (reviewed, not live-verified — see README)
  packages/
    core/              domain logic — pure TypeScript, no I/O
      src/auth/          password hashing (PBKDF2/WebCrypto), JWT sign/verify — implemented
      src/policy/        canView() grant-matrix decision function (§10, §14) — implemented
      src/doses/         schedule generation + adherence math (§5) — implemented
      src/wellness/      metricCategoryFor() (MOOD vs WELLNESS_METRICS split), nextCheckInQuestion() — implemented
      src/safety/        classifyInput(), validateOutput(), toneDirective(), escalation.config.ts — implemented
      src/ai/            callWithFallback() provider-chain orchestration — implemented
      src/human/         default grant categories, checkGoalContent() non-medical heuristic — implemented
    contracts/         zod schemas + typed client shared by both apps
      src/buddy.ts, coach.ts   Phase 5 request/response shapes
    tokens/            design tokens — implemented (Phase 6)
      src/contrast.ts    contrastRatio() (WCAG relative-luminance math) + the two color palettes
      src/typography.ts  two fixed type scales, not a runtime multiplier
      src/touchTarget.ts, motion.ts   touch-target sizing, motion-preference tokens
      src/index.ts       getTokens(mode) — the one function apps/mobile's root calls
  docs/
    BUILD_PLAN.md      full phase-by-phase build plan, mapped to spec sections §1–§21
    AI_PROVIDERS.md    verified free-tier limits and model IDs
  README.md            this file
```
