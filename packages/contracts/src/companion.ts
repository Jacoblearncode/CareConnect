import { z } from "zod";

export const sendMessageRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(2000),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const aiMessageRoleSchema = z.enum(["USER", "ASSISTANT", "SYSTEM"]);

export const aiMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: aiMessageRoleSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type AiMessage = z.infer<typeof aiMessageSchema>;

export const safetyCategorySchema = z.enum(["CRISIS", "DOSAGE_CHANGE", "DIAGNOSIS_SEEKING", "GENERAL"]);
export type SafetyCategory = z.infer<typeof safetyCategorySchema>;

export const sendMessageResponseSchema = z.object({
  conversationId: z.string().uuid(),
  userMessage: aiMessageSchema,
  assistantMessage: aiMessageSchema,
  category: safetyCategorySchema,
  escalated: z.boolean(),
});
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

export const aiConversationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  startedAt: z.string().datetime(),
});
export type AiConversation = z.infer<typeof aiConversationSchema>;
