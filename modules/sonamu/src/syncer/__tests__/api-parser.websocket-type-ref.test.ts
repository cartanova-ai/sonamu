import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { registeredApis } from "../../api/decorators";
import { type AbsolutePath } from "../../utils/path-utils";
import { readApisFromFile } from "../api-parser";

describe("readApisFromFile websocket type refs", () => {
  let originalApis: Array<(typeof registeredApis)[number]> = [];
  let tempDir: string | null = null;

  beforeEach(() => {
    originalApis = [...registeredApis];
  });

  afterEach(async () => {
    registeredApis.splice(0, registeredApis.length, ...originalApis);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("captures websocket event identifiers for generated service imports", async () => {
    registeredApis.push({
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
      },
    });

    tempDir = await mkdtemp(path.join(tmpdir(), "sonamu-api-parser-"));
    const filePath: AbsolutePath = `/${path.relative("/", path.join(tempDir, "chat.frame.ts"))}`;
    await writeFile(
      filePath,
      `
class ChatFrameClass {
  @api()
  @websocket({
    outEvents: ChatOutEvents,
    inEvents: ChatInEvents,
  })
  async subscribeChat(): Promise<void> {
    return;
  }
}
      `.trim(),
    );

    const [api] = await readApisFromFile(filePath);

    expect(api?.websocketOptions?.outEventsTypeRef).toEqual({
      t: "ref",
      id: "ChatOutEvents",
    });
    expect(api?.websocketOptions?.inEventsTypeRef).toEqual({
      t: "ref",
      id: "ChatInEvents",
    });
  });
});
