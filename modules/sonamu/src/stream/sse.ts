import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";

// NOTE(Haze, 251106): context provider에서 인자를 채워주면 createSSE(events)만으로 사용 가능
export function createSSEFactory<T extends z.ZodObject>(
  socket: FastifyRequest["socket"],
  reply: FastifyReply,
  _events: T
) {
  return new SSEConnection<T>(socket, reply);
}

class SSEConnection<T extends z.ZodObject> {
  private _closed = false;

  constructor(
    private readonly socket: FastifyRequest["socket"],
    private readonly reply: FastifyReply
  ) {
    this.socket.on("close", () => {
      this._closed = true;
    });
  }

  publish<K extends keyof z.infer<T>>(event: K, data: z.infer<T>[K]): void {
    if (this._closed) {
      return;
    }

    this.reply.sse({
      event: event as string,
      data: JSON.stringify(data),
    });
  }

  async end(): Promise<void> {
    if (this._closed) {
      return;
    }

    this.reply.sse({
      event: "end",
      data: "END",
    });
    
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.reply.raw.end();
  }
}
