/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { z } from "zod";

export const ChatUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  image: z.string().nullable().optional(),
});
export type ChatUser = z.infer<typeof ChatUser>;

export const ChatMessage = z.object({
  id: z.number().int(),
  content: z.string(),
  created_at: z.date(),
  user: ChatUser,
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatOutEvents = z.object({
  newMessage: ChatMessage,
  typingUsers: z.array(ChatUser),
});
export type ChatOutEvents = z.infer<typeof ChatOutEvents>;

export const ChatInEvents = z.object({
  send: z.object({ content: z.string().min(1).max(2000) }),
  typing: z.object({ active: z.boolean() }),
});
export type ChatInEvents = z.infer<typeof ChatInEvents>;
