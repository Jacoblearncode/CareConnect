import {
  accountDeletionRequestSchema,
  setConsentRequestSchema,
  type AuditLogEntry,
} from "@careconnect/contracts";
import { auth as coreAuth } from "@careconnect/core";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

export function registerPrivacyRoutes(app: Hono<AppEnv>): void {
  const privacy = new Hono<AppEnv>();
  privacy.use("*", requireAuth);

  /**
   * A user's own audit trail (§14: users can see who did what to their
   * account/data, not just admins). Actions where they were the actor OR
   * the target — e.g. a coach viewing their trends shows up here too.
   */
  privacy.get("/audit-log", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const limitParam = Number(c.req.query("limit") ?? 20);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

    const entries = await db.auditLog.findMany({
      where: { OR: [{ actorUserId: userId }, { targetUserId: userId }] },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const dto: AuditLogEntry[] = entries.map((e) => ({
      id: e.id,
      action: e.action,
      actorUserId: e.actorUserId,
      targetUserId: e.targetUserId,
      targetType: e.targetType,
      targetId: e.targetId,
      createdAt: e.createdAt.toISOString(),
    }));
    return c.json({ entries: dto }, 200);
  });

  privacy.get("/consent", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const records = await db.consentRecord.findMany({ where: { userId } });
    return c.json(
      {
        records: records.map((r) => ({
          type: r.type,
          granted: r.granted,
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      200,
    );
  });

  privacy.post("/consent", async (c) => {
    const body = setConsentRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;
    const userId = c.var.userId as string;
    const { type, granted } = body.data;

    const record = await db.consentRecord.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, granted },
      update: { granted },
    });

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "consent.updated",
        targetUserId: userId,
        targetType: "ConsentRecord",
        targetId: record.id,
        metadata: { type, granted },
      },
    });

    return c.json({ type: record.type, granted: record.granted, updatedAt: record.updatedAt.toISOString() }, 200);
  });

  /**
   * Synchronous JSON export of everything this user owns (§14 "data
   * export"). A real deployment would queue this and email a download link
   * for a large account; inline is fine for a prototype and keeps the
   * behavior easy to verify.
   */
  privacy.post("/export", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;

    const [
      user,
      medications,
      healthMetrics,
      checkIns,
      grantsGiven,
      grantsReceived,
      consent,
      notificationPrefs,
      buddyInvitesSent,
      buddyInvitesReceived,
      buddyLinks,
      buddyMessagesSent,
      accountabilityGoalsCreated,
      coachLinksAsPatient,
      coachLinksAsCoach,
      coachNotesAuthored,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          dateOfBirth: true,
          timezone: true,
          accessibilityMode: true,
          createdAt: true,
        },
      }),
      db.medication.findMany({
        where: { userId },
        include: { scheduleRules: true, doseInstances: true },
      }),
      db.healthMetric.findMany({ where: { userId } }),
      db.checkIn.findMany({ where: { userId } }),
      db.permissionGrant.findMany({ where: { ownerId: userId } }),
      db.permissionGrant.findMany({ where: { granteeId: userId } }),
      db.consentRecord.findMany({ where: { userId } }),
      db.notificationPreference.findMany({ where: { userId } }),
      db.buddyInvite.findMany({ where: { fromUserId: userId } }),
      db.buddyInvite.findMany({ where: { toUserId: userId } }),
      db.buddyLink.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
      db.buddyMessage.findMany({ where: { senderId: userId } }),
      db.accountabilityGoal.findMany({ where: { createdByUserId: userId } }),
      db.coachLink.findMany({ where: { patientUserId: userId } }),
      db.coachLink.findMany({ where: { coachUserId: userId } }),
      db.coachNote.findMany({ where: { authorUserId: userId } }),
    ]);

    if (!user) {
      throw Errors.unauthorized();
    }

    await db.auditLog.create({
      data: { actorUserId: userId, action: "privacy.export.requested", targetUserId: userId },
    });

    return c.json(
      {
        exportedAt: new Date().toISOString(),
        profile: user,
        medications,
        healthMetrics,
        checkIns,
        permissions: { granted: grantsGiven, receivedFromOthers: grantsReceived },
        consent,
        notificationPreferences: notificationPrefs,
        buddies: {
          invitesSent: buddyInvitesSent,
          invitesReceived: buddyInvitesReceived,
          links: buddyLinks,
          messagesSent: buddyMessagesSent,
          accountabilityGoalsCreated,
        },
        coaching: {
          linksAsPatient: coachLinksAsPatient,
          linksAsCoach: coachLinksAsCoach,
          notesAuthored: coachNotesAuthored,
        },
      },
      200,
    );
  });

  /**
   * Anonymizing soft-delete (§14 "data deletion"), not a hard DELETE of the
   * User row. Two reasons: (1) other users' data references this user —
   * BuddyMessage.senderId, CoachNote.authorUserId, AuditLog — and a real
   * delete would either cascade into destroying a buddy's own message
   * history or be blocked by referential integrity; (2) the audit trail
   * this endpoint itself writes must survive the deletion it describes.
   * So: strictly personal health data (medications, metrics, check-ins,
   * AI history) is hard-deleted; relationships are marked inactive rather
   * than removed, so the other party's side isn't silently destroyed;
   * identity fields are scrubbed to an unusable placeholder.
   */
  privacy.delete("/account", async (c) => {
    const body = accountDeletionRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation('Send { "confirm": "DELETE" } to confirm this irreversible action.');
    }
    const db = c.var.db;
    const userId = c.var.userId as string;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status === "DELETED") {
      throw Errors.unauthorized();
    }

    await db.auditLog.create({
      data: { actorUserId: userId, action: "user.delete_requested", targetUserId: userId },
    });

    await db.$transaction([
      db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      db.escalationEvent.deleteMany({ where: { userId } }),
      db.aiConversation.deleteMany({ where: { userId } }),
      db.medication.deleteMany({ where: { userId } }),
      db.medicationDraft.deleteMany({ where: { userId } }),
      db.healthMetric.deleteMany({ where: { userId } }),
      db.checkIn.deleteMany({ where: { userId } }),
      db.notification.deleteMany({ where: { userId } }),
      db.notificationPreference.deleteMany({ where: { userId } }),
      db.permissionGrant.deleteMany({ where: { OR: [{ ownerId: userId }, { granteeId: userId }] } }),
      db.consentRecord.deleteMany({ where: { userId } }),
      db.buddyLink.updateMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        data: { status: "REMOVED" },
      }),
      db.coachLink.updateMany({
        where: { OR: [{ coachUserId: userId }, { patientUserId: userId }] },
        data: { status: "ENDED" },
      }),
    ]);

    await db.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.careconnect.invalid`,
        passwordHash: await coreAuth.hashPassword(coreAuth.randomOpaqueToken()),
        displayName: "Deleted user",
        dateOfBirth: null,
        status: "DELETED",
      },
    });

    return c.json({ message: "Account deleted." }, 200);
  });

  app.route("/privacy", privacy);
}
