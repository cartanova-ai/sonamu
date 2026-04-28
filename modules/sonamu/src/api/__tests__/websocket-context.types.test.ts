import { describe, expectTypeOf, it } from "vitest";

import { type WebSocketContext } from "../context";

type ChatOutEvents = {
  ready: {
    history: string[];
  };
  typingUsers: Array<{
    id: string;
    name: string;
  }>;
};

type ChatInEvents = {
  sendMessage: {
    content: string;
  };
  typing: {
    active: boolean;
  };
};

function assertTypedWebSocketContext(ctx: WebSocketContext<ChatOutEvents, ChatInEvents>) {
  ctx.ws.onMessage("sendMessage", (data) => {
    expectTypeOf(data).toEqualTypeOf<{ content: string }>();
    expectTypeOf(data.content).toEqualTypeOf<string>();
  });

  ctx.ws.onMessage("typing", (data) => {
    expectTypeOf(data).toEqualTypeOf<{ active: boolean }>();
    expectTypeOf(data.active).toEqualTypeOf<boolean>();
  });

  ctx.ws.publish("ready", { history: ["hello"] });
  ctx.ws.publish("typingUsers", [{ id: "u1", name: "Kim" }]);

  // @ts-expect-error invalid inbound event name
  ctx.ws.onMessage("unknown", () => {});
  // @ts-expect-error invalid outbound payload
  ctx.ws.publish("ready", { nope: true });
}

function assertDefaultWebSocketContext(ctx: WebSocketContext) {
  ctx.ws.onMessage("sendMessage", (data) => {
    expectTypeOf(data).toEqualTypeOf<unknown>();
  });
}

describe("WebSocketContext typing", () => {
  it("narrows ws handlers and publish payloads from generic event maps", () => {
    expectTypeOf(assertTypedWebSocketContext).toBeFunction();
  });

  it("defaults handler payloads to unknown when generics are omitted", () => {
    expectTypeOf(assertDefaultWebSocketContext).toBeFunction();
  });
});
