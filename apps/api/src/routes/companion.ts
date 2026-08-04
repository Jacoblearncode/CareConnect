import { sendMessageRequestSchema, type AiMessage, type AiConversation } from "@careconnect/contracts";
import type { AiConversation as PrismaAiConversation, AiMessage as PrismaAiMessage } from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "../app-env.js";
import { generateCompanionReply } from "../ai/companion.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * No ?userId= anywhere in this file, on purpose: the schema's DataCategory
 * enum has no entry for AI companion data (§10's four tiers cover
 * medications/adherence/wellness/check-ins/mood/appointments, not
 * conversations), and README "Buddy visibility" is explicit that companion
 * conversation content stays private regardless of any grant. So there's no
 * cross-user read path to build here — every route below is unconditionally
 * self-only, the same way every write route elsewhere in this API is.
 */

function toConversationDto(c: PrismaAiConversation): AiConversation {
  return { id: c.id, userId: c.userId, startedAt: c.startedAt.toISOString() };
}

function toMessageDto(m: PrismaAiMessage): AiMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

export function registerCompanionRoutes(app: Hono<AppEnv>): void {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  router.get("/companion/conversations", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;
    const conversations = await db.aiConversation.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
    });
    return c.json({ conversations: conversations.map(toConversationDto) }, 200);
  });

  router.get("/companion/conversations/:id/messages", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId as string;

    const conversation = await db.aiConversation.findUnique({ where: { id: c.req.param("id") } });
    if (!conversation) throw Errors.notFound("Conversation");
    if (conversation.userId !== userId) throw Errors.forbidden();

    const messages = await db.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    return c.json({ messages: messages.map(toMessageDto) }, 200);
  });

  router.post("/companion/messages", async (c) => {
    const body = sendMessageRequestSchema.safeParse(await c.req.json());
    if (!body.success) throw Errors.validation(body.error.issues[0]?.message ?? "Invalid request.");
    const db = c.var.db;
    const config = c.var.config;
    const userId = c.var.userId as string;

    let conversation: PrismaAiConversation;
    if (body.data.conversationId) {
      const existing = await db.aiConversation.findUnique({ where: { id: body.data.conversationId } });
      if (!existing) throw Errors.notFound("Conversation");
      if (existing.userId !== userId) throw Errors.forbidden();
      conversation = existing;
    } else {
      conversation = await db.aiConversation.create({ data: { userId } });
    }

    const userMessage = await db.aiMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: body.data.content },
    });

    const reply = await generateCompanionReply(db, config, userId, body.data.content);

    const assistantMessage = await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: reply.content,
        safetyFlags: reply.safetyFlags as object,
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: userId,
        action: "companion.message_sent",
        targetUserId: userId,
        targetType: "AiConversation",
        targetId: conversation.id,
        metadata: { category: reply.category, providerUsed: reply.providerUsed },
      },
    });

    if (reply.escalated) {
      await db.escalationEvent.create({
        data: {
          userId,
          conversationId: conversation.id,
          triggerReason: `input_classification:${reply.category}`,
        },
      });
      await db.auditLog.create({
        data: {
          actorUserId: userId,
          action: "companion.escalated",
          targetUserId: userId,
          targetType: "AiConversation",
          targetId: conversation.id,
        },
      });
    }

    return c.json(
      {
        conversationId: conversation.id,
        userMessage: toMessageDto(userMessage),
        assistantMessage: toMessageDto(assistantMessage),
        category: reply.category,
        escalated: reply.escalated,
      },
      201,
    );
  });

  app.route("/", router);
}
