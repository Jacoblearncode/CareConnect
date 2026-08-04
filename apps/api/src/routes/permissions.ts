import { revokeGrantRequestSchema, upsertGrantRequestSchema, type Grant } from "@careconnect/contracts";
import type { PermissionGrant } from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { hasActiveRelationship } from "../policy/relationship.js";

function toGrantDto(
  grant: PermissionGrant & {
    owner?: { displayName: string } | null;
    grantee?: { displayName: string } | null;
  },
): Grant {
  return {
    id: grant.id,
    ownerId: grant.ownerId,
    ownerDisplayName: grant.owner?.displayName,
    granteeId: grant.granteeId,
    granteeDisplayName: grant.grantee?.displayName,
    category: grant.category,
    level: grant.level,
    updatedAt: grant.updatedAt.toISOString(),
  };
}

export function registerPermissionRoutes(app: Hono<AppEnv>): void {
  const permissions = new Hono<AppEnv>();
  permissions.use("*", requireAuth);

  /** Who can see my data, and what — the owner side of the grant matrix. */
  permissions.get("/grants", async (c) => {
    const db = c.var.db;
    const ownerId = c.var.userId as string;
    const grants = await db.permissionGrant.findMany({
      where: { ownerId },
      include: { grantee: { select: { displayName: true } } },
      orderBy: [{ granteeId: "asc" }, { category: "asc" }],
    });
    return c.json({ grants: grants.map(toGrantDto) }, 200);
  });

  /** What I can see of other people's data — the grantee side. */
  permissions.get("/shared-with-me", async (c) => {
    const db = c.var.db;
    const granteeId = c.var.userId as string;
    const grants = await db.permissionGrant.findMany({
      where: { granteeId, level: "VIEW" },
      include: { owner: { select: { displayName: true } } },
      orderBy: [{ ownerId: "asc" }, { category: "asc" }],
    });
    return c.json({ grants: grants.map(toGrantDto) }, 200);
  });

  permissions.put("/grants", async (c) => {
    const body = upsertGrantRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;
    const ownerId = c.var.userId as string;
    const { granteeId, category, level } = body.data;

    if (granteeId === ownerId) {
      throw Errors.validation("You can't grant access to yourself.");
    }
    // A grant only means something layered on an existing relationship
    // (Build Plan §3.1) — this also stops granting access to a stranger.
    if (!(await hasActiveRelationship(db, ownerId, granteeId))) {
      throw Errors.noRelationship();
    }

    const grant = await db.permissionGrant.upsert({
      where: { ownerId_granteeId_category: { ownerId, granteeId, category } },
      create: { ownerId, granteeId, category, level },
      update: { level },
      include: { grantee: { select: { displayName: true } } },
    });

    await db.auditLog.create({
      data: {
        actorUserId: ownerId,
        action: "permission.grant.updated",
        targetUserId: granteeId,
        targetType: "PermissionGrant",
        targetId: grant.id,
        metadata: { category, level },
      },
    });

    return c.json({ grant: toGrantDto(grant) }, 200);
  });

  permissions.delete("/grants", async (c) => {
    const body = revokeGrantRequestSchema.safeParse({
      granteeId: c.req.query("granteeId"),
      category: c.req.query("category"),
    });
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;
    const ownerId = c.var.userId as string;
    const { granteeId, category } = body.data;

    // Set to NONE rather than deleting the row: the audit log entry below is
    // the durable history of the change, and an explicit NONE grant reads
    // more honestly than a missing row that could be mistaken for "never
    // configured."
    const grant = await db.permissionGrant.upsert({
      where: { ownerId_granteeId_category: { ownerId, granteeId, category } },
      create: { ownerId, granteeId, category, level: "NONE" },
      update: { level: "NONE" },
    });

    await db.auditLog.create({
      data: {
        actorUserId: ownerId,
        action: "permission.grant.revoked",
        targetUserId: granteeId,
        targetType: "PermissionGrant",
        targetId: grant.id,
        metadata: { category },
      },
    });

    return c.body(null, 204);
  });

  app.route("/permissions", permissions);
}
