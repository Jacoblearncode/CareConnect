import {
  confirmDraftRequestSchema,
  createDraftRequestSchema,
  createMedicationRequestSchema,
  recordDoseRequestSchema,
  updateMedicationRequestSchema,
  type AdherenceReport,
  type DoseInstance,
  type Medication,
  type MedicationDraft,
} from "@careconnect/contracts";
import { doses as coreDoses } from "@careconnect/core";
import type {
  DoseInstance as PrismaDoseInstance,
  Medication as PrismaMedication,
  MedicationDraft as PrismaMedicationDraft,
} from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { closeExpiredDoses } from "../doses/sweep.js";
import { generateDoseInstancesFor } from "../doses/generate.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertCanView } from "../policy/gate.js";

function toMedicationDto(m: PrismaMedication): Medication {
  return {
    id: m.id,
    userId: m.userId,
    name: m.name,
    strength: m.strength,
    form: m.form,
    instructions: m.instructions,
    startDate: m.startDate.toISOString(),
    endDate: m.endDate?.toISOString() ?? null,
    isActive: m.isActive,
    createdAt: m.createdAt.toISOString(),
  };
}

function toDoseDto(d: PrismaDoseInstance & { medication?: { name: string } }): DoseInstance {
  return {
    id: d.id,
    medicationId: d.medicationId,
    medicationName: d.medication?.name,
    scheduledAt: d.scheduledAt.toISOString(),
    windowEndsAt: d.windowEndsAt.toISOString(),
    status: d.status,
    recordedAt: d.recordedAt?.toISOString() ?? null,
    note: d.note,
  };
}

function toDraftDto(d: PrismaMedicationDraft): MedicationDraft {
  return {
    id: d.id,
    userId: d.userId,
    sourceImageRef: d.sourceImageRef,
    extractedName: d.extractedName,
    extractedStrength: d.extractedStrength,
    extractedInstructions: d.extractedInstructions,
    aiConfidence: d.aiConfidence,
    status: d.status,
    confirmedMedicationId: d.confirmedMedicationId,
    createdAt: d.createdAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
  };
}

/** `?userId=` lets a buddy/coach view someone else's data; defaults to self. Every use is followed by an assertCanView call. */
function resolveOwnerId(c: { req: { query: (k: string) => string | undefined }; var: { userId?: string } }): string {
  return c.req.query("userId") ?? (c.var.userId as string);
}

export function registerMedicationRoutes(app: Hono<AppEnv>): void {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // --- Medications -----------------------------------------------------

  router.get("/medications", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const ownerId = resolveOwnerId(c);
    await assertCanView(db, actorId, ownerId, "MEDICATIONS");

    const medications = await db.medication.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ medications: medications.map(toMedicationDto) }, 200);
  });

  // NOTE: every static "/medications/xxx" GET route (adherence, drafts) must
  // be registered before the dynamic "/medications/:id" route below — Hono
  // matches routes in registration order, so a static path registered after
  // a param route gets shadowed by it (e.g. "/medications/adherence" would
  // match ":id" = "adherence" and 404 as if it were a medication lookup).

  router.get("/medications/adherence", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const ownerId = resolveOwnerId(c);
    // Aggregate rate only — narrower than MEDICATIONS, which exposes identity.
    await assertCanView(db, actorId, ownerId, "ADHERENCE");
    await closeExpiredDoses(db);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [todayDoses, weekDoses, monthDoses] = await Promise.all([
      db.doseInstance.findMany({
        where: { medication: { userId: ownerId }, scheduledAt: { gte: startOfToday } },
        select: { status: true },
      }),
      db.doseInstance.findMany({
        where: { medication: { userId: ownerId }, scheduledAt: { gte: startOfWeek } },
        select: { status: true },
      }),
      db.doseInstance.findMany({
        where: { medication: { userId: ownerId }, scheduledAt: { gte: startOfMonth } },
        select: { status: true },
      }),
    ]);

    const report: AdherenceReport = {
      today: coreDoses.summarizeAdherence(todayDoses),
      week: coreDoses.summarizeAdherence(weekDoses),
      month: coreDoses.summarizeAdherence(monthDoses),
    };
    return c.json(report, 200);
  });

  router.get("/medications/drafts", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const drafts = await db.medicationDraft.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ drafts: drafts.map(toDraftDto) }, 200);
  });

  router.get("/medications/:id", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const medication = await db.medication.findUnique({ where: { id: c.req.param("id") } });
    if (!medication) throw Errors.notFound("Medication");
    await assertCanView(db, actorId, medication.userId, "MEDICATIONS");
    return c.json({ medication: toMedicationDto(medication) }, 200);
  });

  router.post("/medications", async (c) => {
    const body = createMedicationRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const { schedule, ...med } = body.data;

    const startDate = new Date(med.startDate);
    const endDate = med.endDate ? new Date(med.endDate) : null;

    const medication = await db.$transaction(async (tx) => {
      const created = await tx.medication.create({
        data: {
          userId,
          name: med.name,
          strength: med.strength ?? null,
          form: med.form ?? null,
          instructions: med.instructions ?? null,
          startDate,
          endDate,
        },
      });
      await tx.scheduleRule.create({
        data: {
          medicationId: created.id,
          timesOfDay: schedule.timesOfDay,
          daysOfWeek: schedule.daysOfWeek,
          timezone: schedule.timezone,
          windowMinutes: schedule.windowMinutes,
        },
      });
      await generateDoseInstancesFor(tx, created.id, schedule, startDate, endDate);
      return created;
    });

    await db.auditLog.create({
      data: { actorUserId: userId, action: "medication.created", targetUserId: userId, targetType: "Medication", targetId: medication.id },
    });

    return c.json({ medication: toMedicationDto(medication) }, 201);
  });

  router.patch("/medications/:id", async (c) => {
    const body = updateMedicationRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;

    const existing = await db.medication.findUnique({ where: { id: c.req.param("id") } });
    if (!existing) throw Errors.notFound("Medication");
    if (existing.userId !== userId) throw Errors.forbidden(); // writes are always self-only, never delegated

    // Only touch fields actually present in the request — an omitted field
    // means "leave as-is," not "clear it" (exactOptionalPropertyTypes means
    // that distinction has to be a key's presence, not an `undefined` value).
    const updated = await db.medication.update({
      where: { id: existing.id },
      data: {
        ...(body.data.strength !== undefined && { strength: body.data.strength }),
        ...(body.data.form !== undefined && { form: body.data.form }),
        ...(body.data.instructions !== undefined && { instructions: body.data.instructions }),
        ...(body.data.endDate !== undefined && {
          endDate: body.data.endDate ? new Date(body.data.endDate) : null,
        }),
        ...(body.data.isActive !== undefined && { isActive: body.data.isActive }),
      },
    });

    await db.auditLog.create({
      data: { actorUserId: userId, action: "medication.updated", targetUserId: userId, targetType: "Medication", targetId: updated.id },
    });

    return c.json({ medication: toMedicationDto(updated) }, 200);
  });

  // --- Doses -------------------------------------------------------------

  router.get("/medications/:id/doses", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const medication = await db.medication.findUnique({ where: { id: c.req.param("id") } });
    if (!medication) throw Errors.notFound("Medication");
    await assertCanView(db, actorId, medication.userId, "MEDICATIONS");

    await closeExpiredDoses(db);
    const instances = await db.doseInstance.findMany({
      where: { medicationId: medication.id },
      orderBy: { scheduledAt: "desc" },
      take: 200,
    });
    return c.json({ doses: instances.map((d) => toDoseDto(d)) }, 200);
  });

  router.get("/doses/today", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const ownerId = resolveOwnerId(c);
    await assertCanView(db, actorId, ownerId, "MEDICATIONS");

    await closeExpiredDoses(db);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const instances = await db.doseInstance.findMany({
      where: {
        medication: { userId: ownerId },
        scheduledAt: { gte: startOfDay, lt: endOfDay },
      },
      include: { medication: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
    });
    return c.json({ doses: instances.map(toDoseDto) }, 200);
  });

  router.post("/doses/:doseId/record", async (c) => {
    const body = recordDoseRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;

    const dose = await db.doseInstance.findUnique({
      where: { id: c.req.param("doseId") },
      include: { medication: true },
    });
    if (!dose) throw Errors.notFound("Dose");
    if (dose.medication.userId !== userId) throw Errors.forbidden(); // writes are always self-only

    // TAKEN/SKIPPED are terminal — an adherence record isn't editable after
    // the fact. MISSED is time-derived, not a deliberate action, so it can
    // still be corrected (late logging: "I did take it, just recording late").
    if (dose.status === "TAKEN" || dose.status === "SKIPPED") {
      throw Errors.conflict(`This dose was already recorded as ${dose.status.toLowerCase()} and can't be changed.`);
    }

    let windowEndsAt = dose.windowEndsAt;
    if (body.data.status === "SNOOZED") {
      windowEndsAt = new Date(Date.now() + 15 * 60 * 1000);
    }

    const updated = await db.doseInstance.update({
      where: { id: dose.id },
      data: {
        status: body.data.status,
        note: body.data.note ?? null,
        recordedAt: new Date(),
        windowEndsAt,
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "dose.recorded",
        targetUserId: userId,
        targetType: "DoseInstance",
        targetId: updated.id,
        metadata: { status: updated.status },
      },
    });

    return c.json({ dose: toDoseDto(updated) }, 200);
  });

  // --- Medication drafts: OCR verification gate (§3.3) --------------------
  // Self-only throughout — you don't confirm someone else's scan.

  router.post("/medications/drafts", async (c) => {
    const body = createDraftRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;

    const draft = await db.medicationDraft.create({
      data: {
        userId,
        sourceImageRef: body.data.sourceImageRef ?? null,
        extractedName: body.data.extractedName ?? null,
        extractedStrength: body.data.extractedStrength ?? null,
        extractedInstructions: body.data.extractedInstructions ?? null,
        aiConfidence: body.data.aiConfidence ?? null,
        rawOcrText: body.data.rawOcrText ?? null,
      },
    });
    return c.json({ draft: toDraftDto(draft) }, 201);
  });

  router.post("/medications/drafts/:id/confirm", async (c) => {
    const body = confirmDraftRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;

    const draft = await db.medicationDraft.findUnique({ where: { id: c.req.param("id") } });
    if (!draft) throw Errors.notFound("Draft");
    if (draft.userId !== userId) throw Errors.forbidden();
    if (draft.status !== "PENDING_REVIEW") {
      throw Errors.conflict(`This draft was already ${draft.status.toLowerCase()}.`);
    }

    const { schedule, ...med } = body.data;
    const startDate = new Date(med.startDate);
    const endDate = med.endDate ? new Date(med.endDate) : null;

    const medication = await db.$transaction(async (tx) => {
      const created = await tx.medication.create({
        data: {
          userId,
          name: med.name,
          strength: med.strength ?? null,
          form: med.form ?? null,
          instructions: med.instructions ?? null,
          startDate,
          endDate,
        },
      });
      await tx.scheduleRule.create({
        data: {
          medicationId: created.id,
          timesOfDay: schedule.timesOfDay,
          daysOfWeek: schedule.daysOfWeek,
          timezone: schedule.timezone,
          windowMinutes: schedule.windowMinutes,
        },
      });
      await generateDoseInstancesFor(tx, created.id, schedule, startDate, endDate);
      await tx.medicationDraft.update({
        where: { id: draft.id },
        data: { status: "CONFIRMED", confirmedMedicationId: created.id, reviewedAt: new Date() },
      });
      return created;
    });

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "medication.draft_confirmed",
        targetUserId: userId,
        targetType: "Medication",
        targetId: medication.id,
        metadata: { draftId: draft.id },
      },
    });

    return c.json({ medication: toMedicationDto(medication) }, 201);
  });

  router.post("/medications/drafts/:id/discard", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;

    const draft = await db.medicationDraft.findUnique({ where: { id: c.req.param("id") } });
    if (!draft) throw Errors.notFound("Draft");
    if (draft.userId !== userId) throw Errors.forbidden();
    if (draft.status !== "PENDING_REVIEW") {
      throw Errors.conflict(`This draft was already ${draft.status.toLowerCase()}.`);
    }

    const updated = await db.medicationDraft.update({
      where: { id: draft.id },
      data: { status: "DISCARDED", reviewedAt: new Date() },
    });
    return c.json({ draft: toDraftDto(updated) }, 200);
  });

  app.route("/", router);
}
