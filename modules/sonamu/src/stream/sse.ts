import { type FastifyReply, type FastifyRequest } from "fastify";
import { type z } from "zod";

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
    get closed() {
      return false;
    },
    onClose: (_callback) => {},
    publish: (_event, _data) => {},
    end: () => Promise.resolve(),
  };
}

export interface SSEConnection<T extends z.ZodObject> {
  get closed(): boolean;
  onClose(callback: () => void): void;
  publish<K extends keyof z.infer<T>>(event: K, data: z.infer<T>[K]): void;
  end(): Promise<void>;
}

class SSEConnectionImpl<T extends z.ZodObject> implements SSEConnection<T> {
  private closedState = false;
  private closeCallbacks: Array<() => void> = [];

  private readonly markClosed = () => {
    this.closedState = true;
    this.fireCloseCallbacks();
  };

  get closed(): boolean {
    return this.closedState;
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.push(callback);
  }

  // 콜백을 한 번만 실행하고 배열을 비워 중복 호출을 방지
  private fireCloseCallbacks(): void {
    const callbacks = this.closeCallbacks;
    this.closeCallbacks = [];
    for (const cb of callbacks) {
      cb();
    }
  }

  constructor(
    private readonly socket: FastifyRequest["socket"],
    private readonly reply: FastifyReply,
  ) {
    this.socket.on("close", this.markClosed);
    this.socket.on("error", this.markClosed);
  }

  publish<K extends keyof z.infer<T>>(event: K, data: z.infer<T>[K]): void {
    if (this.closedState) {
      return;
    }

    this.reply.sse({
      event:
        /* SAFETY: 등록된 WebSocket 이벤트 스키마가 이 값의 타입을 보장한다. */ event as string,
      data: JSON.stringify(data),
    });
  }

  async end(): Promise<void> {
    if (this.closedState) {
      return;
    }

    this.closedState = true;
    this.socket.off("close", this.markClosed);
    this.socket.off("error", this.markClosed);
    this.fireCloseCallbacks();

    this.reply.sse({
      event: "end",
      data: "END",
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    this.reply.raw.end();
  }
}
