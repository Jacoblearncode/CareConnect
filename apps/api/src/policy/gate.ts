import { policy } from "@careconnect/core";
import type { PrismaClient } from "@prisma/client";
import { Errors } from "../errors.js";
import { hasActiveRelationship } from "./relationship.js";

/**
 * The single point every health-data read routes through (Build Plan §3.1).
 * Resolves the actual grant row and relationship status from the database,
 * then defers the actual decision to the pure policy.canView() function —
 * this file is the only place that decision logic is allowed to be
 * re-implemented ad hoc, which is the point of having it at all.
 *
 * Every current and future route that reads one user's health data on
 * another user's behalf (buddy views, coach dashboard, etc.) must call this
 * before returning anything, not just filter query results afterward.
 */
export async function assertCanView(
  db: PrismaClient,
  actorId: string,
  ownerId: string,
  category: policy.DataCategory,
): Promise<void> {
  if (actorId === ownerId) {
    return;
  }

  const [grant, relationshipActive] = await Promise.all([
    db.permissionGrant.findUnique({
      where: { ownerId_granteeId_category: { ownerId, granteeId: actorId, category } },
      select: { level: true },
    }),
    hasActiveRelationship(db, actorId, ownerId),
  ]);

  const allowed = policy.canView({ actorId, ownerId, grant, relationshipActive });
  if (!allowed) {
    throw Errors.forbidden();
  }
}
