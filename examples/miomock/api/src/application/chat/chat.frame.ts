import { pick } from "radashi";
import { BaseFrameClass, Sonamu, websocket, type WebSocketContext } from "sonamu";

import { ChatInEvents, ChatOutEvents, type ChatMessage, type ChatUser } from "./chat.types";

const CHAT_ROOM_ID = "global";
const CHAT_NAMESPACE = "chat";
const TYPING_TIMEOUT_MS = 5000;

const typingByUser = new Map<string, { user: ChatUser; timeout: NodeJS.Timeout }>();

function currentTypingUsers(): ChatUser[] {
  return Array.from(typingByUser.values()).map((e) => e.user);
}

class ChatFrameClass extends BaseFrameClass {
  @websocket({
    namespace: CHAT_NAMESPACE,
    heartbeat: 30_000,
    guards: ["user"],
    outEvents: ChatOutEvents,
    inEvents: ChatInEvents,
  })
  async subscribeChat(ctx: WebSocketContext<ChatOutEvents, ChatInEvents>): Promise<void> {
    const user = ctx.user;
    if (!user) throw new Error("unauthenticated");

    ctx.ws.join(CHAT_ROOM_ID);
    ctx.ws.setUserId(user.id);

    ctx.ws.publish("typingUsers", currentTypingUsers());

    ctx.ws.onMessage("send", async (data) => {
      const { content } = data;
      const trimmed = content.trim();
      if (!trimmed) return;

      this.clearTyping(user.id);

      const message: ChatMessage = {
        id: 0,
        content: trimmed,
        created_at: new Date(),
        user: pick(user, ["id", "name", "email", "image"]),
      };
      Sonamu.websocketRuntime.publishToRoom(CHAT_ROOM_ID, "newMessage", message, CHAT_NAMESPACE);
    });

    ctx.ws.onMessage("typing", ({ active }) => {
      if (active) {
        this.setTyping(user);
      } else {
        this.clearTyping(user.id);
      }
    });

    ctx.ws.onClose(() => {
      ctx.ws.leave(CHAT_ROOM_ID);
    });

    await ctx.ws.waitForClose();
  }

  private broadcastTyping(): void {
    Sonamu.websocketRuntime.publishToRoom(
      CHAT_ROOM_ID,
      "typingUsers",
      currentTypingUsers(),
      CHAT_NAMESPACE,
    );
  }

  private clearTyping(userId: string): void {
    const entry = typingByUser.get(userId);
    if (!entry) return;

    clearTimeout(entry.timeout);
    typingByUser.delete(userId);

    this.broadcastTyping();
  }

  private setTyping(user: ChatUser): void {
    const existing = typingByUser.get(user.id);
    if (existing) clearTimeout(existing.timeout);

    const timeout = setTimeout(() => {
      typingByUser.delete(user.id);
      this.broadcastTyping();
    }, TYPING_TIMEOUT_MS);
    typingByUser.set(user.id, { user, timeout });

    if (!existing) this.broadcastTyping();
  }
}

export const ChatFrame = new ChatFrameClass();
