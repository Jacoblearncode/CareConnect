# CareConnect — Build Plan

This document maps the build to the section numbers of *Build Specification — CareConnect*
(referred to below as §1–§21). It records the architecture, the decisions taken and why, and
the phase order.

See the root [`README.md`](../README.md) for the product overview, current status, and roadmap
summary. This document is the detailed phase-by-phase reference.

---

## 1. Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Primary client | **Expo (React Native)** | The product itself. Native camera (§4), on-device scheduled notifications (§13), text-to-speech (§12). |
| Secondary client | **Next.js console** | Admin/developer visibility and the coach dashboard (§10). Deliberately read-mostly. |
| Backend | **Hono on Node**, single API | Forces a real API boundary; both clients consume the same contract. Only the API touches the database. |
| Database | **Postgres (Neon free tier) + Prisma** | §21 lists "database schema" as a deliverable; `schema.prisma` is one legible artifact. |
| Auth | **JWT access + refresh, argon2** | Cookie sessions are awkward from React Native. |
| AI | **Free-tier providers with a fallback chain** | Cost. See §4 of this document for the safety consequence. |
| Scope order | **11 Essentials (§19) first** | §19 explicitly prefers a working MVP over broad shallow integration. |

Satisfying §21's "responsive mobile/desktop layouts": mobile is the native app, desktop is the
console. Expo Web additionally provides a browser-openable build of the real app as a live-demo
fallback.

---

## 2. Repository layout

```
careconnect/
  apps/
    mobile/          Expo (React Native) — the real app, all 18 screens (§16)
    console/         Next.js — admin/dev + coach dashboard (§10)
    api/             Hono on Node — the only process that touches the database
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
  what information their buddy can see."
- Revoking a coach ends future access; anything already exported is recorded in the audit log
  rather than pretended to be retractable.

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

The companion's tool surface is **read-only**. It can read the medication list; it has no write tool
at all, which is what makes §12's "do not allow voice commands to modify prescriptions" and §15's
"never change medication dosage" structurally true rather than prompt-dependent.

Escalation (§11) is triggered by the input classifier, not by the model's judgement. Emergency
guidance is region-neutral by default and lives in one configuration file.

**Task before Phase 1 closes:** verify each provider's current free-tier limits and available model
IDs directly, rather than relying on documentation that may be out of date, then lock the choices.

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
