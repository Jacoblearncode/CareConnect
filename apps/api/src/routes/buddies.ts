import {
  createAccountabilityGoalRequestSchema,
  createBuddyInviteRequestSchema,
  sendBuddyMessageRequestSchema,
  updateAccountabilityGoalRequestSchema,
  type AccountabilityGoal,
  type BuddyInvite,
  type BuddyLink,
  type BuddyMessage,
} from "@careconnect/contracts";
import { human } from "@careconnect/core";
import type {
  AccountabilityGoal as PrismaAccountabilityGoal,
  BuddyInvite as PrismaBuddyInvite,
  BuddyLink as PrismaBuddyLink,
  BuddyMessage as PrismaBuddyMessage,
  PrismaClient,
} from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

function toInviteDto(
  invite: PrismaBuddyInvite & { fromUser?: { displayName: string } | null },
): BuddyInvite {
  return {
    id: invite.id,
    fromUserId: invite.fromUserId,
    ...(invite.fromUser ? { fromUserDisplayName: invite.fromUser.displayName } : {}),
    toUserId: invite.toUserId,
    toEmail: invite.toEmail,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    respondedAt: invite.respondedAt?.toISOString() ?? null,
  };
}

function toLinkDto(
  link: PrismaBuddyLink & { userA: { displayName: string }; userB: { displayName: string } },
  viewerId: string,
): BuddyLink {
  const viewerIsA = link.userAId === viewerId;
  return {
    id: link.id,
    buddyUserId: viewerIsA ? link.userBId : link.userAId,
    buddyDisplayName: viewerIsA ? link.userB.displayName : link.userA.displayName,
    status: link.status,
    createdAt: link.createdAt.toISOString(),
  };
}

function toMessageDto(
  message: PrismaBuddyMessage & { sender?: { displayName: string } | null },
): BuddyMessage {
  return {
    id: message.id,
    buddyLinkId: message.buddyLinkId,
    senderId: message.senderId,
    ...(message.sender ? { senderDisplayName: message.sender.displayName } : {}),
    type: message.type,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function toGoalDto(goal: PrismaAccountabilityGoal): AccountabilityGoal {
  return {
    id: goal.id,
    buddyLinkId: goal.buddyLinkId,
    createdByUserId: goal.createdByUserId,
    title: goal.title,
    description: goal.description,
    targetDate: goal.targetDate?.toISOString() ?? null,
    status: goal.status,
    createdAt: goal.createdAt.toISOString(),
  };
}

/** Throws 404/403/409 as appropriate; otherwise returns the ACTIVE link both users belong to. */
async function requireActiveLinkMembership(
  db: PrismaClient,
  linkId: string,
  userId: string,
): Promise<PrismaBuddyLink> {
  const link = await db.buddyLink.findUnique({ where: { id: linkId } });
  if (!link) throw Errors.notFound("Buddy link");
  if (link.userAId !== userId && link.userBId !== userId) throw Errors.forbidden();
  if (link.status !== "ACTIVE") throw Errors.conflict("This buddy link is no longer active.");
  return link;
}

/**
 * Build Plan §3.1: a newly accepted buddy link grants clinical-detail
 * visibility in both directions by default (BuddyLink has no inherent
 * "patient" role — see human/defaults.ts). Upserts rather than creates,
 * matching the revoke behavior in routes/permissions.ts, so a re-add after a
 * previous removal doesn't collide with stale NONE rows.
 */
async function grantDefaultBuddyVisibility(
  db: PrismaClient,
  userAId: string,
  userBId: string,
): Promise<void> {
  for (const [ownerId, granteeId] of [
    [userAId, userBId],
    [userBId, userAId],
  ] as const) {
    for (const category of human.DEFAULT_BUDDY_GRANT_CATEGORIES) {
      await db.permissionGrant.upsert({
        where: { ownerId_granteeId_category: { ownerId, granteeId, category } },
        create: { ownerId, granteeId, category, level: "VIEW" },
        update: { level: "VIEW" },
      });
    }
  }
}

export function registerBuddyRoutes(app: Hono<AppEnv>): void {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // --- Invites (§9) ----------------------------------------------------------

  router.get("/buddies/invites", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const [sent, received] = await Promise.all([
      db.buddyInvite.findMany({
        where: { fromUserId: userId },
        include: { fromUser: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.buddyInvite.findMany({
        where: { toUserId: userId },
        include: { fromUser: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return c.json(
      { sent: sent.map(toInviteDto), received: received.map(toInviteDto) },
      200,
    );
  });

  router.post("/buddies/invites", async (c) => {
    const body = createBuddyInviteRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const fromUserId = c.var.userId as string;

    let toUserId = body.data.toUserId ?? null;
    const toEmail = body.data.toEmail ?? null;

    if (!toUserId && toEmail) {
      // Reconciled at registration too (see routes/auth.ts) for the reverse
      // case: invite sent before the invitee has an account.
      const existing = await db.user.findUnique({ where: { email: toEmail } });
      if (existing) toUserId = existing.id;
    }

    if (toUserId === fromUserId) {
      throw Errors.validation("You can't invite yourself.");
    }

    if (toUserId) {
      const existingLink = await db.buddyLink.findFirst({
        where: {
          status: "ACTIVE",
          OR: [
            { userAId: fromUserId, userBId: toUserId },
            { userAId: toUserId, userBId: fromUserId },
          ],
        },
      });
      if (existingLink) throw Errors.conflict("You're already buddies with this person.");

      const existingInvite = await db.buddyInvite.findFirst({
        where: {
          status: "PENDING",
          OR: [
            { fromUserId, toUserId },
            { fromUserId: toUserId, toUserId: fromUserId },
          ],
        },
      });
      if (existingInvite) throw Errors.conflict("There's already a pending invite between you two.");
    }

    const invite = await db.buddyInvite.create({
      data: { fromUserId, toUserId, toEmail: toUserId ? null : toEmail },
      include: { fromUser: { select: { displayName: true } } },
    });

    await db.auditLog.create({
      data: {
        actorUserId: fromUserId,
        action: "buddy.invite.sent",
        targetType: "BuddyInvite",
        targetId: invite.id,
        ...(toUserId ? { targetUserId: toUserId } : {}),
        ...(toUserId ? {} : { metadata: { toEmail } }),
      },
    });

    return c.json({ invite: toInviteDto(invite) }, 201);
  });

  router.post("/buddies/invites/:id/accept", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const invite = await db.buddyInvite.findUnique({ where: { id: c.req.param("id") } });
    if (!invite) throw Errors.notFound("Buddy invite");
    if (invite.toUserId !== userId) throw Errors.forbidden();
    if (invite.status !== "PENDING") throw Errors.conflict("This invite is no longer pending.");

    const link = await db.$transaction(async (tx) => {
      const created = await tx.buddyLink.upsert({
        where: { userAId_userBId: { userAId: invite.fromUserId, userBId: invite.toUserId as string } },
        create: { userAId: invite.fromUserId, userBId: invite.toUserId as string },
        update: { status: "ACTIVE" },
      });
      await tx.buddyInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      return created;
    });

    await grantDefaultBuddyVisibility(db, link.userAId, link.userBId);

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.invite.accepted",
        targetUserId: invite.fromUserId,
        targetType: "BuddyLink",
        targetId: link.id,
      },
    });

    const full = await db.buddyLink.findUniqueOrThrow({
      where: { id: link.id },
      include: { userA: { select: { displayName: true } }, userB: { select: { displayName: true } } },
    });
    return c.json({ link: toLinkDto(full, userId) }, 200);
  });

  router.post("/buddies/invites/:id/decline", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const invite = await db.buddyInvite.findUnique({ where: { id: c.req.param("id") } });
    if (!invite) throw Errors.notFound("Buddy invite");
    if (invite.toUserId !== userId) throw Errors.forbidden();
    if (invite.status !== "PENDING") throw Errors.conflict("This invite is no longer pending.");

    await db.buddyInvite.update({
      where: { id: invite.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.invite.declined",
        targetUserId: invite.fromUserId,
        targetType: "BuddyInvite",
        targetId: invite.id,
      },
    });
    return c.body(null, 204);
  });

  router.post("/buddies/invites/:id/cancel", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const invite = await db.buddyInvite.findUnique({ where: { id: c.req.param("id") } });
    if (!invite) throw Errors.notFound("Buddy invite");
    if (invite.fromUserId !== userId) throw Errors.forbidden();
    if (invite.status !== "PENDING") throw Errors.conflict("This invite is no longer pending.");

    await db.buddyInvite.update({
      where: { id: invite.id },
      data: { status: "CANCELED", respondedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.invite.canceled",
        targetType: "BuddyInvite",
        targetId: invite.id,
        ...(invite.toUserId ? { targetUserId: invite.toUserId } : {}),
      },
    });
    return c.body(null, 204);
  });

  // --- Links -------------------------------------------------------------------

  router.get("/buddies", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const links = await db.buddyLink.findMany({
      where: { status: "ACTIVE", OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: { select: { displayName: true } }, userB: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ links: links.map((l) => toLinkDto(l, userId)) }, 200);
  });

  // --- Messages (§9) -------------------------------------------------------------

  router.get("/buddies/:id/messages", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);
    const messages = await db.buddyMessage.findMany({
      where: { buddyLinkId: link.id },
      include: { sender: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return c.json({ messages: messages.map(toMessageDto) }, 200);
  });

  router.post("/buddies/:id/messages", async (c) => {
    const body = sendBuddyMessageRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);

    const message = await db.buddyMessage.create({
      data: { buddyLinkId: link.id, senderId: userId, type: body.data.type, body: body.data.body },
      include: { sender: { select: { displayName: true } } },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.message.sent",
        targetUserId: link.userAId === userId ? link.userBId : link.userAId,
        targetType: "BuddyMessage",
        targetId: message.id,
        metadata: { type: message.type },
      },
    });
    return c.json({ message: toMessageDto(message) }, 201);
  });

  // --- Accountability goals (§9) --------------------------------------------

  router.get("/buddies/:id/goals", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);
    const goals = await db.accountabilityGoal.findMany({
      where: { buddyLinkId: link.id },
      orderBy: { createdAt: "desc" },
    });
    return c.json({ goals: goals.map(toGoalDto) }, 200);
  });

  router.post("/buddies/:id/goals", async (c) => {
    const body = createAccountabilityGoalRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);

    const goal = await db.accountabilityGoal.create({
      data: {
        buddyLinkId: link.id,
        createdByUserId: userId,
        title: body.data.title,
        ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        ...(body.data.targetDate !== undefined ? { targetDate: new Date(body.data.targetDate) } : {}),
      },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.goal.created",
        targetType: "AccountabilityGoal",
        targetId: goal.id,
      },
    });
    return c.json({ goal: toGoalDto(goal) }, 201);
  });

  router.patch("/buddies/:id/goals/:goalId", async (c) => {
    const body = updateAccountabilityGoalRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);

    const existing = await db.accountabilityGoal.findUnique({ where: { id: c.req.param("goalId") } });
    if (!existing || existing.buddyLinkId !== link.id) throw Errors.notFound("Accountability goal");

    const goal = await db.accountabilityGoal.update({
      where: { id: existing.id },
      data: { status: body.data.status },
    });
    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.goal.updated",
        targetType: "AccountabilityGoal",
        targetId: goal.id,
        metadata: { status: goal.status },
      },
    });
    return c.json({ goal: toGoalDto(goal) }, 200);
  });

  // --- Remove a link (§9) --------------------------------------------------------
  // Registered last: DELETE /buddies/:id shares a path shape with GET
  // /buddies/:id/messages and /buddies/:id/goals only in its first segment,
  // but static routes are still kept ahead of this on principle (Build Plan
  // §3.3's sibling lesson from Phase 2's /medications/:id shadowing bug).

  router.delete("/buddies/:id", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const link = await requireActiveLinkMembership(db, c.req.param("id"), userId);
    const otherUserId = link.userAId === userId ? link.userBId : link.userAId;

    await db.$transaction([
      db.buddyLink.update({ where: { id: link.id }, data: { status: "REMOVED" } }),
      // Grants only mean something layered on an active relationship
      // (Build Plan §3.1 / policy/can.ts), but setting them to NONE
      // explicitly — rather than leaving stray VIEW rows — keeps
      // GET /permissions/grants honest if the two ever reconnect.
      db.permissionGrant.updateMany({
        where: {
          OR: [
            { ownerId: userId, granteeId: otherUserId },
            { ownerId: otherUserId, granteeId: userId },
          ],
        },
        data: { level: "NONE" },
      }),
    ]);

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "buddy.link.removed",
        targetUserId: otherUserId,
        targetType: "BuddyLink",
        targetId: link.id,
      },
    });
    return c.body(null, 204);
  });

  app.route("/", router);
}
