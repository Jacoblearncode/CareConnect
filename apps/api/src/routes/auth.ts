import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  type AuthResponse,
} from "@careconnect/contracts";
import { auth as coreAuth } from "@careconnect/core";
import type { PrismaClient, User } from "@prisma/client";
import { Hono } from "hono";
import type { AppConfig } from "../env.js";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

function toAuthUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accessibilityMode: user.accessibilityMode,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Issues a new access token + rotated opaque refresh token, persisting the session. */
async function issueTokens(db: PrismaClient, config: AppConfig, user: User): Promise<AuthResponse> {
  const accessToken = await coreAuth.signJwt({ sub: user.id }, config.jwtAccessSecret, config.accessTokenTtlSeconds);

  const refreshToken = coreAuth.randomOpaqueToken();
  const refreshTokenHash = await coreAuth.hashOpaqueToken(refreshToken);
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);

  await db.session.create({
    data: { userId: user.id, refreshTokenHash, expiresAt },
  });

  return {
    user: toAuthUser(user),
    tokens: { accessToken, refreshToken, expiresAt: expiresAt.toISOString() },
  };
}

export function registerAuthRoutes(app: Hono<AppEnv>): void {
  const auth = new Hono<AppEnv>();

  auth.post("/register", async (c) => {
    const body = registerRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;

    const existing = await db.user.findUnique({ where: { email: body.data.email } });
    if (existing) {
      throw Errors.emailTaken();
    }

    const passwordHash = await coreAuth.hashPassword(body.data.password);
    const user = await db.user.create({
      data: {
        email: body.data.email,
        passwordHash,
        displayName: body.data.displayName,
      },
    });

    await db.auditLog.create({
      data: { actorUserId: user.id, action: "user.register", targetUserId: user.id },
    });

    const response = await issueTokens(db, c.var.config, user);
    return c.json(response, 201);
  });

  auth.post("/login", async (c) => {
    const body = loginRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;

    const user = await db.user.findUnique({ where: { email: body.data.email } });
    // Same generic error whether the email doesn't exist or the password is
    // wrong — never reveal which one, per §14.
    if (!user || !(await coreAuth.verifyPassword(body.data.password, user.passwordHash))) {
      throw Errors.invalidCredentials();
    }
    if (user.status !== "ACTIVE") {
      throw Errors.accountDisabled();
    }

    await db.auditLog.create({
      data: { actorUserId: user.id, action: "user.login", targetUserId: user.id },
    });

    const response = await issueTokens(db, c.var.config, user);
    return c.json(response, 200);
  });

  auth.post("/refresh", async (c) => {
    const body = refreshRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;

    const refreshTokenHash = await coreAuth.hashOpaqueToken(body.data.refreshToken);
    const session = await db.session.findUnique({ where: { refreshTokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw Errors.invalidRefreshToken();
    }

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== "ACTIVE") {
      throw Errors.invalidRefreshToken();
    }

    // Rotate: the presented refresh token is single-use.
    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    const response = await issueTokens(db, c.var.config, user);
    return c.json(response, 200);
  });

  auth.post("/logout", async (c) => {
    const body = refreshRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    }
    const db = c.var.db;

    const refreshTokenHash = await coreAuth.hashOpaqueToken(body.data.refreshToken);
    await db.session.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return c.body(null, 204);
  });

  auth.get("/me", requireAuth, async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;
    if (!userId) {
      throw Errors.unauthorized();
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE") {
      throw Errors.unauthorized();
    }
    return c.json({ user: toAuthUser(user) }, 200);
  });

  app.route("/auth", auth);
}
