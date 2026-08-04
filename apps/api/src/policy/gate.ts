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
 * another user's behalf (buddy views, coach dashboard, etc.) must call one
 * of the two functions below before returning anything, not just filter
 * query results afterward.
 */
async function resolveCanView(
  db: PrismaClient,
  actorId: string,
  ownerId: string,
  category: policy.DataCategory,
): Promise<boolean> {
  if (actorId === ownerId) {
    return true;
  }
  const [grant, relationshipActive] = await Promise.all([
    db.permissionGrant.findUnique({
      where: { ownerId_granteeId_category: { ownerId, granteeId: actorId, category } },
      select: { level: true },
    }),
    hasActiveRelationship(db, actorId, ownerId),
  ]);
  return policy.canView({ actorId, ownerId, grant, relationshipActive });
}

/** Throws 403 if denied. Use for endpoints that only ever expose one category. */
export async function assertCanView(
  db: PrismaClient,
  actorId: string,
  ownerId: string,
  category: policy.DataCategory,
): Promise<void> {
  if (!(await resolveCanView(db, actorId, ownerId, category))) {
    throw Errors.forbidden();
  }
}

/**
 * Non-throwing. Use where a request can legitimately span more than one
 * category and partial visibility is correct — e.g. listing health metrics,
 * where MOOD and WELLNESS_METRICS are granted independently (§10) and a
 * buddy might have one but not the other. The caller filters results down to
 * the categories this returns true for, rather than all-or-nothing denying
 * the whole request.
 */
export async function canViewCategory(
  db: PrismaClient,
  actorId: string,
  ownerId: string,
  category: policy.DataCategory,
): Promise<boolean> {
  return resolveCanView(db, actorId, ownerId, category);
}
