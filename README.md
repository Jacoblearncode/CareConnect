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

**Planning complete, implementation not yet started.** See [Roadmap](#roadmap) for phase status.

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
| **`apps/mobile`** (Expo / React Native) | The product. All 18 screens (§16). | Native camera for label scanning (§4), on-device scheduled notifications with no push server (§13), text-to-speech (§12). Expo Web also gives a browser-openable fallback build for live demos. |
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
  contracts/       zod schemas + typed client, shared by both apps
  tokens/          design tokens, including the accessibility scale (§12)
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
   time.

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

The companion's tool surface is **read-only** — it can read the medication list but has no write
tool at all, which is what makes "never change medication dosage" (§15) and "do not allow voice
commands to modify prescriptions without explicit confirmation" (§12) structurally true rather than
dependent on the model behaving.

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

The primary evidence that these rules hold is an **adversarial test suite** (Phase 4) asserting
response properties for diagnosis-seeking, dosage-change, stop-medication, and crisis-language
inputs — run against the deterministic classifier/validator described above, not against the model
in isolation.

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
| 1 — Permission spine | Grant matrix, audit log, consent/export/delete | Not started |
| 2 — Medication | CRUD, dose state machine, adherence, reminders, OCR-draft gate | Not started |
| 3 — Wellness | Health metrics (11 types), adaptive daily check-in | Not started |
| 4 — AI companion & safety | Full safety pipeline, escalation, adversarial test suite | Not started |
| 5 — Human layer | Buddy invites, messaging, accountability; coach data model | Not started |
| 6 — Accessibility | Token-layer Senior/Accessibility Mode, TTS, confirmations | Not started |
| 7 — Dashboard & notifications | "What do I need to do today?" dashboard, quiet hours | Not started |
| **→ 11 Essentials (§19) complete and demoable end-to-end** | | |
| 8 — Console | Admin/dev views, coach dashboard | Not started |
| 9 — Advanced | OCR, voice interaction, charts/trends, AI summaries, exports, mock wearables | Not started |
| 10 — Polish | Empty/loading/error states, disclaimers, this README | Not started |

Essentials are built end-to-end and properly, before any Advanced item is started (§19).

### Platform constraints on record

- **Medication reminders are genuinely functional**, not simulated: Expo schedules local
  notifications on-device with no push server or APNs/FCM credentials required.
- **Voice input likely needs an Expo development build**, not Expo Go, because speech-to-text
  needs a native module. Text-to-speech (read-aloud, §12) works everywhere. Voice input is an
  Advanced item (Phase 9), so this blocks nothing on the Essentials path.

### Decision log

Four decisions were open after the initial architecture pass and are now resolved:

| Decision | Resolution |
| --- | --- |
| **API hosting** | Dual-runtime: `apps/api` deploys unmodified to a Node host or to Cloudflare Workers. Enabled by Prisma's Neon serverless driver adapter (HTTP/WebSocket, not raw TCP) and PBKDF2/WebCrypto password hashing (no native binding). See [Data & auth](#data--auth). |
| **Coach dashboard priority** | Stays in Phase 8, per §19's own categorization. No schema change — the data model still lands in Phase 5; only the dashboard UI is later. |
| **Buddy visibility granularity** | Default grant is **clinical detail** (medication names, adherence events, wellness metrics), not just engagement signals. AI companion conversations and notes marked private stay private regardless. Because this default is broader than §9's own example, per-buddy narrowing ships in the same phase as the grant itself (Phase 1/5), not later. |
| **Emergency escalation copy** | Configurable per deployment. One config module holds a region field and hotline numbers, defaulting to neutral wording when unset. |

---

## Getting started

`apps/api` and its auth flow are functional as of Phase 0. `apps/mobile` and `apps/console` don't
exist yet — this section covers what's runnable today and will grow as each app lands.

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

The full auth flow is live: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` (bearer
token), `POST /auth/refresh` (rotates the refresh token — the old one stops working), and
`POST /auth/logout`.

### 5. Run checks

```bash
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit, every package
pnpm test        # vitest, currently packages/core's auth unit tests
pnpm build       # tsc build, every package
```

CI (`.github/workflows/ci.yml`) runs all of the above against a fresh Postgres service container
on every push and pull request.

### What's not here yet

- `apps/mobile` and `apps/console` are unscaffolded — see their `README.md` stubs for which phase
  brings each online.
- Only auth routes exist on the API. Medication, wellness, buddy, coach, and AI companion routes
  arrive in Phases 1–5 per the [Roadmap](#roadmap).
- The AI safety adversarial test suite referenced in [AI safety](#ai-safety) is written in Phase 4.

---

## Repository structure

```
careconnect/
  apps/
    mobile/            Expo (React Native) — the product (not yet scaffolded, Phase 2+)
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
        routes/auth.ts   register / login / refresh / logout / me
  packages/
    core/              domain logic — pure TypeScript, no I/O
      src/auth/          password hashing (PBKDF2/WebCrypto), JWT sign/verify — implemented
      src/policy/        permission engine (§10, §14) — Phase 1
      src/doses/         dose state machine + adherence math (§5) — Phase 2
      src/safety/        AI guardrails, input and output (§15, §18) — Phase 4
      src/ai/            provider abstraction + fallback chain — Phase 4
    contracts/         zod schemas + typed client shared by both apps
    tokens/            design tokens, including the accessibility scale — Phase 6
  docs/
    BUILD_PLAN.md      full phase-by-phase build plan, mapped to spec sections §1–§21
    AI_PROVIDERS.md    verified free-tier limits and model IDs
  README.md            this file
```
