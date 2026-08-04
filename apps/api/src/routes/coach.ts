import {
  createCoachGoalRequestSchema,
  createCoachLinkRequestSchema,
  createCoachNoteRequestSchema,
  updateCoachGoalRequestSchema,
  upsertCoachProfileRequestSchema,
  type CoachGoal,
  type CoachLink,
  type CoachNote,
  type CoachProfile,
} from "@careconnect/contracts";
import { human } from "@careconnect/core";
import type {
  CoachGoal as PrismaCoachGoal,
  CoachLink as PrismaCoachLink,
  CoachNote as PrismaCoachNote,
  CoachProfile as PrismaCoachProfile,
  PrismaClient,
} from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

function toProfileDto(
  profile: PrismaCoachProfile & { user: { displayName: string } },
): CoachProfile {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.user.displayName,
    bio: profile.bio,
    credentials: profile.credentials,
    createdAt: profile.createdAt.toISOString(),
  };
}

function toLinkDto(
  link: PrismaCoachLink & {
    coachUser: { displayName: string };
    patientUser: { displayName: string };
  },
): CoachLink {
  return {
    id: link.id,
    coachUserId: link.coachUserId,
    coachDisplayName: link.coachUser.displayName,
    patientUserId: link.patientUserId,
    patientDisplayName: link.patientUser.displayName,
    status: link.status,
    createdAt: link.createdAt.toISOString(),
  };
}

function toNoteDto(
  note: PrismaCoachNote & { author?: { displayName: string } | null },
): CoachNote {
  return {
    id: note.id,
    coachLinkId: note.coachLinkId,
    authorUserId: note.authorUserId,
    ...(note.author ? { authorDisplayName: note.author.displayName } : {}),
    body: note.body,
    createdAt: note.createdAt.toISOString(),
  };
}

function toGoalDto(goal: PrismaCoachGoal): CoachGoal {
  return {
    id: goal.id,
    coachLinkId: goal.coachLinkId,
    title: goal.title,
    description: goal.description,
    targetDate: goal.targetDate?.toISOString() ?? null,
    status: goal.status,
    createdAt: goal.createdAt.toISOString(),
  };
}

async function requireLinkMembership(
  db: PrismaClient,
  linkId: string,
  userId: string,
): Promise<PrismaCoachLink> {
  const link = await db.coachLink.findUnique({ where: { id: linkId } });
  if (!link) throw Errors.notFound("Coach link");
  if (link.coachUserId !== userId && link.patientUserId !== userId) throw Errors.forbidden();
  return link;
}

async function requireActiveLinkMembership(
  db: PrismaClient,
  linkId: string,
  userId: string,
): Promise<PrismaCoachLink> {
  const link = await requireLinkMembership(db, linkId, userId);
  if (link.status !== "ACTIVE") throw Errors.conflict("This coach link is not active.");
  return link;
}

/** Build Plan §3.1's coach default: ADHERENCE, WELLNESS_METRICS, CHECKINS, patient -> coach only. */
async function grantDefaultCoachVisibility(
  db: PrismaClient,
  patientUserId: string,
  coachUserId: string,
): Promise<void> {
  for (const category of human.DEFAULT_COACH_GRANT_CATEGORIES) {
    await db.permissionGrant.upsert({
      where: { ownerId_granteeId_category: { ownerId: patientUserId, granteeId: coachUserId, category } },
      create: { ownerId: patientUserId, granteeId: coachUserId, category, level: "VIEW" },
      update: { level: "VIEW" },
    });
  }
}

export function registerCoachRoutes(app: Hono<AppEnv>): void {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // --- Directory & profile (§10) --------------------------------------------

  router.get("/coach/directory", async (c) => {
    const db = c.var.db;
    const profiles = await db.coachProfile.findMany({
      where: { user: { isCoach: true, status: "ACTIVE" } },
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return c.json({ coaches: profiles.map(toProfileDto) }, 200);
  });

  router.put("/coach/profile", async (c) => {
    const body = upsertCoachProfileRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isCoach) {
      throw Errors.validation("Only accounts flagged as a coach can maintain a coach profile.");
    }

    const profile = await db.coachProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...(body.data.bio !== undefined ? { bio: body.data.bio } : {}),
        ...(body.data.credentials !== undefined ? { credentials: body.data.credentials } : {}),
      },
      update: {
        ...(body.data.bio !== undefined ? { bio: body.data.bio } : {}),
        ...(body.data.credentials !== undefined ? { credentials: body.data.credentials } : {}),
      },
      include: { user: { select: { displayName: true } } },
    });
    return c.json({ profile: toProfileDto(profile) }, 200);
  });

  // --- Coach links (§10) -----------------------------------------------------

  router.get("/coach/links", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const links = await db.coachLink.findMany({
      where: { OR: [{ coachUserId: userId }, { patientUserId: userId }] },
      include: {
        coachUser: { select: { displayName: true } },
        patientUser: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ links: links.map(toLinkDto) }, 200);
  });

  /**
   * Either side can initiate, but who ends up "accepting" depends on
   * direction (Build Plan §3.1's consent principle: only the data owner's
   * own action can create the grant that follows).
   *   - A patient requesting a registered coach activates immediately —
   *     the patient just performed the consenting action themselves.
   *   - A coach inviting someone as a patient lands PENDING; the patient
   *     still has to accept before the coach sees anything of theirs.
   */
  router.post("/coach/links", async (c) => {
    const body = createCoachLinkRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const actorId = c.var.userId as string;
    const counterpartId = body.data.counterpartUserId;

    if (counterpartId === actorId) throw Errors.validation("You can't link with yourself.");

    const [actorUser, counterpart] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: actorId } }),
      db.user.findUnique({ where: { id: counterpartId } }),
    ]);
    if (!counterpart) throw Errors.notFound("User");

    let coachUserId: string;
    let patientUserId: string;
    let status: "PENDING" | "ACTIVE";
    if (actorUser.isCoach) {
      coachUserId = actorId;
      patientUserId = counterpartId;
      status = "PENDING";
    } else if (counterpart.isCoach) {
      coachUserId = counterpartId;
      patientUserId = actorId;
      status = "ACTIVE";
    } else {
      throw Errors.validation("One of you must be a registered coach.");
    }

    const existing = await db.coachLink.findUnique({
      where: { coachUserId_patientUserId: { coachUserId, patientUserId } },
    });
    if (existing && existing.status !== "ENDED") {
      throw Errors.conflict("A coach link already exists between you two.");
    }

    const link = await db.coachLink.upsert({
      where: { coachUserId_patientUserId: { coachUserId, patientUserId } },
      create: { coachUserId, patientUserId, status },
      update: { status },
      include: {
        coachUser: { select: { displayName: true } },
        patientUser: { select: { displayName: true } },
      },
    });

    if (status === "ACTIVE") {
      await grantDefaultCoachVisibility(db, patientUserId, coachUserId);
    }

    await db.auditLog.create({
      data: {
        actorUserId: actorId,
        action: "coach.link.requested",
        targetUserId: counterpartId,
        targetType: "CoachLink",
        targetId: link.id,
        metadata: { status },
      },
    });

    return c.json({ link: toLinkDto(link) }, 201);
  });

  router.post("/coach/links/:id/accept", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireLinkMembership(db, c.req.param("id"), userId);
    if (link.patientUserId !== userId) {
      throw Errors.forbidden();
    }
    if (link.status !== "PENDING") throw Errors.conflict("This coach link is not pending.");

    const updated = await db.coachLink.update({
      where: { id: link.id },
      data: { status: "ACTIVE" },
      include: {
        coachUser: { select: { displayName: true } },
        patientUser: { select: { displayName: true } },
      },
    });
    await grantDefaultCoachVisibility(db, link.patientUserId, link.coachUserId);

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "coach.link.accepted",
        targetUserId: link.coachUserId,
        targetType: "CoachLink",
        targetId: link.id,
      },
    });
    return c.json({ link: toLinkDto(updated) }, 200);
  });

  router.post("/coach/links/:id/end", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireLinkMembership(db, c.req.param("id"), userId);
    if (link.status === "ENDED") throw Errors.conflict("This coach link has already ended.");

    await db.$transaction([
      db.coachLink.update({ where: { id: link.id }, data: { status: "ENDED" } }),
      // Build Plan §3.1: "revoking a coach ends future access" — set to
      // NONE explicitly rather than deleting, so the audit trail plus a
      // later GET /permissions/grants both read honestly.
      db.permissionGrant.updateMany({
        where: { ownerId: link.patientUserId, granteeId: link.coachUserId },
        data: { level: "NONE" },
      }),
    ]);

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "coach.link.ended",
        targetUserId: link.coachUserId === userId ? link.patientUserId : link.coachUserId,
        targetType: "CoachLink",
        targetId: link.id,
      },
    });
    return c.body(null, 204);
  });

  // --- Coach notes (§10) ---------------------------------------------------------
  // Both patient and coach can read (transparency-first, per the broader-
  // than-spec-example default this project chose for buddy visibility too).
  // Only the coach authors notes — CoachNote models the coach's own
  // professional record-keeping, not a shared thread.

  router.get("/coach/links/:id/notes", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);
    const notes = await db.coachNote.findMany({
      where: { coachLinkId: link.id },
      include: { author: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ notes: notes.map(toNoteDto) }, 200);
  });

  router.post("/coach/links/:id/notes", async (c) => {
    const body = createCoachNoteRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);
    if (link.coachUserId !== userId) throw Errors.forbidden();

    const note = await db.coachNote.create({
      data: { coachLinkId: link.id, authorUserId: userId, body: body.data.body },
      include: { author: { select: { displayName: true } } },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "coach.note.created",
        targetUserId: link.patientUserId,
        targetType: "CoachNote",
        targetId: note.id,
      },
    });
    return c.json({ note: toNoteDto(note) }, 201);
  });

  // --- Coach goals — non-medical only (§10) ---------------------------------------

  router.get("/coach/links/:id/goals", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);
    const goals = await db.coachGoal.findMany({
      where: { coachLinkId: link.id },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ goals: goals.map(toGoalDto) }, 200);
  });

  router.post("/coach/links/:id/goals", async (c) => {
    const body = createCoachGoalRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);

    const check = human.checkGoalContent(body.data.title, body.data.description);
    if (check.likelyMedical) {
      throw Errors.validation(
        "Coach goals are for non-medical wellness only — this reads as a medical instruction. " +
          "Medication and dosage changes go through the medication record, not a coach goal.",
      );
    }

    const goal = await db.coachGoal.create({
      data: {
        coachLinkId: link.id,
        title: body.data.title,
        ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        ...(body.data.targetDate !== undefined ? { targetDate: new Date(body.data.targetDate) } : {}),
      },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "coach.goal.created",
        targetType: "CoachGoal",
        targetId: goal.id,
      },
    });
    return c.json({ goal: toGoalDto(goal) }, 201);
  });

  router.patch("/coach/links/:id/goals/:goalId", async (c) => {
    const body = updateCoachGoalRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);

    const existing = await db.coachGoal.findUnique({ where: { id: c.req.param("goalId") } });
    if (!existing || existing.coachLinkId !== link.id) throw Errors.notFound("Coach goal");

    const goal = await db.coachGoal.update({
      where: { id: existing.id },
      data: { status: body.data.status },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "coach.goal.updated",
        targetType: "CoachGoal",
        targetId: goal.id,
        metadata: { status: goal.status },
      },
    });
    return c.json({ goal: toGoalDto(goal) }, 200);
  });

  app.route("/", router);
}
