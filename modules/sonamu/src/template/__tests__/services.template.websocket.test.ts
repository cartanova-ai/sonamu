import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { Sonamu } from "../../api";
import { type ExtendedApi } from "../../api/decorators";
import { EntityManager } from "../../entity/entity-manager";
import { Template__services } from "../implementations/services.template";

describe("Template__services websocket event refs", () => {
  let originalConfig: unknown;
  let originalSyncer: unknown;

  beforeEach(() => {
    originalConfig = Reflect.get(Sonamu, "_config");
    originalSyncer = Reflect.get(Sonamu, "_syncer");
  });

  afterEach(() => {
    Reflect.set(Sonamu, "_config", originalConfig);
    Reflect.set(Sonamu, "_syncer", originalSyncer);
  });

  it("reuses websocket event type names when they are importable", () => {
    Reflect.set(Sonamu, "_config", {
      api: {
        route: {
          prefix: "/api",
        },
      },
    });

    const apis: ExtendedApi[] = [
      {
        modelName: "ChatFrame",
        methodName: "subscribeChat",
        path: "/chat/subscribeChat",
        options: {
          httpMethod: "GET",
        },
        websocketOptions: {
          outEvents: z.object({
            ready: z.object({
              ok: z.boolean(),
            }),
          }),
          inEvents: z.object({
            ping: z.object({
              at: z.string(),
            }),
          }),
          outEventsTypeRef: {
            t: "ref",
            id: "ChatOutEvents",
          },
          inEventsTypeRef: {
            t: "ref",
            id: "ChatInEvents",
          },
        },
        typeParameters: [],
        parameters: [],
        returnType: "void",
      },
    ];
    Reflect.set(Sonamu, "_syncer", {
      apis,
    });

    EntityManager.setModulePath("ChatOutEvents", "chat/chat.types");
    EntityManager.setModulePath("ChatInEvents", "chat/chat.types");

    const template = new Template__services();
    const rendered = template.render({});

    expect(rendered.body).toContain("handlers: EventHandlers<ChatOutEvents>");
    expect(rendered.body).toContain("options: WebSocketChannelOptions = {}");
    expect(rendered.body).toContain("useWebSocketChannel<ChatOutEvents, ChatInEvents>");
    expect(rendered.body).toContain("params, handlers, options");
    expect(rendered.importKeys).toEqual(expect.arrayContaining(["ChatOutEvents", "ChatInEvents"]));
  });
});
