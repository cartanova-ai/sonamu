import { describe, expect, it } from "vitest";
import { z } from "zod";

import { Sonamu } from "../../api";
import { type SonamuConfig } from "../../api/config";
import { type ExtendedApi } from "../../api/decorators";
import { EntityManager } from "../../entity/entity-manager";
import { Syncer } from "../../syncer/syncer";
import { Template__services } from "../implementations/services.template";

const testConfig = {
  api: { dir: ".", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
  sync: { targets: [] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
} satisfies SonamuConfig;

describe("Template__services websocket event refs", () => {
  it("가져올 수 있는 websocket 이벤트 타입 이름을 재사용한다", () => {
    Sonamu.config = testConfig;

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
    const syncer = new Syncer();
    syncer.apis = apis;
    Sonamu.syncer = syncer;

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
