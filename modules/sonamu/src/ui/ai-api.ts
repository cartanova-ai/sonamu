import { convertToModelMessages } from "ai";
import { type UIMessage } from "ai";
import { type FastifyInstance } from "fastify";

import { SD } from "../dict/sd";
import { BadRequestException } from "../exceptions/so-exceptions";
import { type FixtureRecord } from "../types/types";
import { aiClient } from "./ai-client";

export async function setAiApi(server: FastifyInstance) {
  await aiClient.init();

  server.post("/api/ai/fixture/chat", async (request, reply) => {
    const { messages, fixtureRecords } =
      /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ request.body as {
        messages: UIMessage[];
        fixtureRecords?: FixtureRecord[];
      };

    if (!fixtureRecords || fixtureRecords.length === 0) {
      throw new BadRequestException(SD("sonamu.error.fixtureRecordRequired"));
    }

    const result = aiClient.handleFixture(await convertToModelMessages(messages), fixtureRecords);
    const response = result.toUIMessageStreamResponse();

    reply.raw.writeHead(response.status, Object.fromEntries(Object.entries(response.headers)));

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
    }

    reply.raw.end();
    return reply;
  });

  // Entity/Enum 생성용 AI Chat Stream
  server.post("/api/ai/entity/chat", async (request, reply) => {
    const { messages } =
      /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ request.body as {
        messages: UIMessage[];
      };

    const result = aiClient.handleEntity(await convertToModelMessages(messages));
    const response = result.toUIMessageStreamResponse();

    reply.raw.writeHead(response.status, Object.fromEntries(Object.entries(response.headers)));

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
    }

    reply.raw.end();
    return reply;
  });
}
