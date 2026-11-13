import { createServer, type Server, type Socket, connect } from "node:net";

import { z } from "zod";

export type TcpProxyMode =
  | { kind: "pass" }
  | { kind: "blackhole" }
  | { kind: "stall-body"; stallAfterBodyBytes: number };

export interface TcpProxy {
  readonly url: string;
  setMode(mode: TcpProxyMode): void;
  readonly connections: number;
  close(): Promise<void>;
}

const HEADER_END = Buffer.from("\r\n\r\n");
const addressSchema = z.looseObject({ port: z.number().int().min(1) });

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = addressSchema.safeParse(server.address());
      if (!address.success) {
        reject(new Error("프록시 주소를 읽지 못했습니다."));
        return;
      }
      resolve(address.data.port);
    });
  });
}

export async function startTcpProxy(upstream: string): Promise<TcpProxy> {
  const target = new URL(upstream);
  const sockets = new Set<Socket>();
  let mode: TcpProxyMode = { kind: "pass" };
  let connections = 0;

  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
  };

  const server = createServer((client) => {
    connections += 1;
    track(client);
    // A mode applies to connections accepted after it was set.
    const current = mode;
    if (current.kind === "blackhole") {
      client.resume();
      return;
    }
    const engine = connect(Number(target.port), target.hostname);
    track(engine);
    client.pipe(engine);
    if (current.kind === "pass") {
      engine.pipe(client);
    } else {
      let seen = Buffer.alloc(0);
      let allowance: number | undefined;
      engine.on("data", (chunk: Buffer) => {
        if (allowance === undefined) {
          seen = Buffer.concat([seen, chunk]);
          const end = seen.indexOf(HEADER_END);
          if (end === -1) return;
          const headerBytes = end + HEADER_END.length;
          const forward = seen.subarray(0, headerBytes + current.stallAfterBodyBytes);
          client.write(forward);
          allowance = Math.max(0, current.stallAfterBodyBytes - (seen.length - headerBytes));
          return;
        }
        if (allowance > 0) {
          const forward = chunk.subarray(0, allowance);
          allowance -= forward.length;
          client.write(forward);
        }
      });
    }
    client.on("close", () => engine.destroy());
    engine.on("close", () => client.destroy());
  });
  const port = await listen(server);

  return {
    url: `http://127.0.0.1:${port}`,
    setMode(next) {
      mode = next;
    },
    get connections() {
      return connections;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
