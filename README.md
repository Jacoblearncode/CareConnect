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
| **`apps/api`** (Hono on Node) | The only process that touches the database. Both clients consume the same contract. | Forces a real API boundary instead of one client reaching into the database directly. |

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

- **Postgres (Neon free tier) + Prisma.** `schema.prisma` is a single legible artifact for the
  "database schema" deliverable in §21.
- **JWT access + refresh tokens, argon2 password hashing.** Cookie-based sessions are awkward to
  drive from React Native, so bearer tokens are used across both clients.

---

## Key design decisions

These are the decisions most likely to be questioned, and why they were made this way. Full detail
is in [`docs/BUILD_PLAN.md` §3](docs/BUILD_PLAN.md#3-cross-cutting-design-decisions).

1. **Permissions are a policy engine, not a column (§10, §14).** Access is a grant matrix —
   `(owner, grantee, data_category) → access level` — resolved by one `can()` function that every
   health-data read passes through server-side. Buddy visibility is per-buddy, not one shared
   bucket, because §9 requires users to control exactly what a buddy can see. Every sensitive
   action is appended to an immutable audit log.

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
| 0 — Foundation | Monorepo, Prisma schema, seed data, auth | Not started |
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

### Open decisions

Not yet finalized; will be resolved before or during the phase noted:

- **API hosting** — Node runtime (Render/Railway/Fly free tier) vs. Cloudflare Workers directly.
  Workers is cheaper/faster but constrains library choices (no native argon2 binding, D1 instead of
  Postgres). *Resolve before Phase 0.*
- **Coach dashboard priority** — currently Phase 8 (Advanced) per §19's own categorization, but it
  most directly demonstrates §20's "humans stay central" thesis and its data model already lands in
  Phase 5. May be promoted ahead of other Advanced items. *Resolve before Phase 8.*
- **Buddy visibility granularity** — assumed to default to engagement-level detail (e.g. "Alex
  hasn't completed today's check-in") rather than clinical detail (e.g. "Alex missed a dose of
  Metformin"), per the example given in §9. *Confirm before Phase 5.*
- **Emergency escalation copy region** — region-neutral wording ("contact your local emergency
  services") by default, with any region-specific numbers isolated to one config file.
  *Confirm before Phase 4, or leave region-neutral.*

---

## Getting started

Setup instructions will be added once Phase 0 (Foundation) lands. This section will cover:

- Prerequisites (Node version, package manager, Expo CLI)
- Environment variables (database URL, JWT secrets, AI provider keys)
- Database setup and seeding
- Running `apps/api`, `apps/mobile`, and `apps/console` locally
- Running the test suite, including the AI safety adversarial suite

---

## Repository structure

```
careconnect/
  apps/
    mobile/      Expo (React Native) — the product
    console/     Next.js — admin/dev + coach dashboard
    api/         Hono on Node — the only process touching the database
  packages/
    core/        domain logic: policy, doses, safety, ai — pure TypeScript, no I/O
    contracts/   zod schemas + typed client shared by both apps
    tokens/      design tokens, including the accessibility scale
  docs/
    BUILD_PLAN.md   full phase-by-phase build plan, mapped to spec sections §1–§21
  README.md         this file
```
