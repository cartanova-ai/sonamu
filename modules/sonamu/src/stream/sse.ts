import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

// NOTE(Haze, 251106): context provider에서 인자를 채워주면 createSSE(events)만으로 사용 가능
export function createSSEFactory<T extends z.ZodObject>(
  socket: FastifyRequest["socket"],
  reply: FastifyReply,
  _events: T,
): SSEConnection<T> {
  return new SSEConnectionImpl<T>(socket, reply);
}

export function createMockSSEFactory<T extends z.ZodObject>(_events: T): SSEConnection<T> {
  return {
    publish: (_event, _data) => {},
    end: () => Promise.resolve(),
  };
}

export interface SSEConnection<T extends z.ZodObject> {
  publish<K extends keyof z.infer<T>>(event: K, data: z.infer<T>[K]): void;
  end(): Promise<void>;
}

class SSEConnectionImpl<T extends z.ZodObject> implements SSEConnection<T> {
  private _closed = false;

  constructor(
    private readonly socket: FastifyRequest["socket"],
    private readonly reply: FastifyReply,
  ) {
    const markClosed = () => {
      this._closed = true;
    };
    this.socket.on("close", markClosed);
    this.socket.on("error", markClosed);
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

    this._closed = true;

    this.reply.sse({
      event: "end",
      data: "END",
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    this.reply.raw.end();
  }
}
