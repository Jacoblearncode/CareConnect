import {
  answerCheckInRequestSchema,
  createMetricRequestSchema,
  type CheckIn,
  type CheckInField,
  type HealthMetric,
} from "@careconnect/contracts";
import { wellness } from "@careconnect/core";
import type { CheckIn as PrismaCheckIn, HealthMetric as PrismaHealthMetric } from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { assertCanView, canViewCategory } from "../policy/gate.js";
import { resolveOwnerId } from "../util/owner.js";

function toMetricDto(m: PrismaHealthMetric): HealthMetric {
  return {
    id: m.id,
    userId: m.userId,
    type: m.type,
    value: m.value,
    valueSecondary: m.valueSecondary,
    unit: m.unit,
    source: m.source,
    recordedAt: m.recordedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  };
}

function toCheckInDto(c: PrismaCheckIn): CheckIn {
  return {
    id: c.id,
    userId: c.userId,
    date: c.date.toISOString().slice(0, 10),
    mood: c.mood,
    energy: c.energy,
    sleepQuality: c.sleepQuality,
    stress: c.stress,
    pain: c.pain,
    medicationAdherence: c.medicationAdherence,
    physicalActivity: c.physicalActivity,
    generalWellbeing: c.generalWellbeing,
    createdAt: c.createdAt.toISOString(),
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function hasActiveMedications(db: AppEnv["Variables"]["db"], userId: string): Promise<boolean> {
  const count = await db.medication.count({ where: { userId, isActive: true } });
  return count > 0;
}

/** Builds the { [field]: value } patch for a single check-in answer. */
function checkInFieldPatch(field: CheckInField, value: number): Partial<Record<CheckInField, number>> {
  return { [field]: value };
}

export function registerWellnessRoutes(app: Hono<AppEnv>): void {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // --- Health metrics (§6) -------------------------------------------------

  router.get("/wellness/metrics", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const ownerId = resolveOwnerId(c);
    const typeFilter = c.req.query("type");

    let allowedTypes: readonly wellness.MetricType[];
    if (typeFilter) {
      const type = typeFilter as wellness.MetricType;
      await assertCanView(db, actorId, ownerId, wellness.metricCategoryFor(type));
      allowedTypes = [type];
    } else {
      // No type filter spans both categories (MOOD and WELLNESS_METRICS are
      // granted independently, §10) — partial visibility is correct here,
      // not all-or-nothing, so this checks both rather than calling
      // assertCanView once.
      const [wellnessOk, moodOk] = await Promise.all([
        canViewCategory(db, actorId, ownerId, "WELLNESS_METRICS"),
        canViewCategory(db, actorId, ownerId, "MOOD"),
      ]);
      if (!wellnessOk && !moodOk) throw Errors.forbidden();
      allowedTypes = wellness.METRIC_TYPES.filter((t) =>
        t === "MOOD" ? moodOk : wellnessOk,
      );
    }

    const metrics = await db.healthMetric.findMany({
      where: { userId: ownerId, type: { in: [...allowedTypes] } },
      orderBy: { recordedAt: "desc" },
      take: 500,
    });
    return c.json({ metrics: metrics.map(toMetricDto) }, 200);
  });

  router.post("/wellness/metrics", async (c) => {
    const body = createMetricRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;

    const metric = await db.healthMetric.create({
      data: {
        userId,
        type: body.data.type,
        value: body.data.value,
        valueSecondary: body.data.valueSecondary ?? null,
        unit: body.data.unit ?? wellness.defaultUnitFor(body.data.type),
        source: body.data.source,
        recordedAt: body.data.recordedAt ? new Date(body.data.recordedAt) : new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "metric.recorded",
        targetUserId: userId,
        targetType: "HealthMetric",
        targetId: metric.id,
        metadata: { type: metric.type, source: metric.source },
      },
    });

    return c.json({ metric: toMetricDto(metric) }, 201);
  });

  router.delete("/wellness/metrics/:id", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;

    const existing = await db.healthMetric.findUnique({ where: { id: c.req.param("id") } });
    if (!existing) throw Errors.notFound("Metric");
    if (existing.userId !== userId) throw Errors.forbidden(); // writes are always self-only

    await db.healthMetric.delete({ where: { id: existing.id } });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "metric.deleted",
        targetUserId: userId,
        targetType: "HealthMetric",
        targetId: existing.id,
      },
    });
    return c.body(null, 204);
  });

  // --- Daily check-in: adaptive, one question at a time (§7) --------------

  router.get("/checkins/today", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const ownerId = resolveOwnerId(c);
    await assertCanView(db, actorId, ownerId, "CHECKINS");

    const [checkIn, activeMeds] = await Promise.all([
      db.checkIn.findUnique({ where: { userId_date: { userId: ownerId, date: startOfToday() } } }),
      hasActiveMedications(db, ownerId),
    ]);

    const nextQuestion = wellness.nextCheckInQuestion(
      {
        mood: checkIn?.mood ?? undefined,
        energy: checkIn?.energy ?? undefined,
        sleepQuality: checkIn?.sleepQuality ?? undefined,
        stress: checkIn?.stress ?? undefined,
        pain: checkIn?.pain ?? undefined,
        medicationAdherence: checkIn?.medicationAdherence ?? undefined,
        physicalActivity: checkIn?.physicalActivity ?? undefined,
        generalWellbeing: checkIn?.generalWellbeing ?? undefined,
      },
      { hasActiveMedications: activeMeds },
    );

    return c.json({ checkIn: checkIn ? toCheckInDto(checkIn) : null, nextQuestion }, 200);
  });

  router.post("/checkins/today", async (c) => {
    const body = answerCheckInRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const date = startOfToday();
    const patch = checkInFieldPatch(body.data.field, body.data.value);

    const checkIn = await db.checkIn.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...patch },
      update: patch,
    });

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "checkin.answered",
        targetUserId: userId,
        targetType: "CheckIn",
        targetId: checkIn.id,
        metadata: { field: body.data.field },
      },
    });

    const activeMeds = await hasActiveMedications(db, userId);
    const nextQuestion = wellness.nextCheckInQuestion(
      {
        mood: checkIn.mood ?? undefined,
        energy: checkIn.energy ?? undefined,
        sleepQuality: checkIn.sleepQuality ?? undefined,
        stress: checkIn.stress ?? undefined,
        pain: checkIn.pain ?? undefined,
        medicationAdherence: checkIn.medicationAdherence ?? undefined,
        physicalActivity: checkIn.physicalActivity ?? undefined,
        generalWellbeing: checkIn.generalWellbeing ?? undefined,
      },
      { hasActiveMedications: activeMeds },
    );

    return c.json({ checkIn: toCheckInDto(checkIn), nextQuestion }, 200);
  });

  router.get("/checkins", async (c) => {
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const ownerId = resolveOwnerId(c);
    await assertCanView(db, actorId, ownerId, "CHECKINS");

    const daysParam = Number(c.req.query("days") ?? 30);
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 100) : 30;
    const since = new Date(startOfToday().getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const checkIns = await db.checkIn.findMany({
      where: { userId: ownerId, date: { gte: since } },
      orderBy: { date: "desc" },
    });
    return c.json({ checkIns: checkIns.map(toCheckInDto) }, 200);
  });

  app.route("/", router);
}
