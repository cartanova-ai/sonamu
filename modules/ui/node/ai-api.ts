import { convertToModelMessages, type UIMessage } from "ai";
import type { FastifyInstance } from "fastify";
import { BadRequestException, type FixtureRecord } from "sonamu";
import { aiClient } from "./ai-client";

export async function setAiApi(server: FastifyInstance) {
  await aiClient.init();

  server.post("/api/openai/chat/stream", async (request, reply) => {
    const { messages, fixtureRecords } = request.body as {
      messages: UIMessage[];
      fixtureRecords?: FixtureRecord[];
    };

    if (!fixtureRecords || fixtureRecords.length === 0) {
      throw new BadRequestException("픽스쳐 레코드가 없습니다. 픽스쳐 조회 후 시도하세요.");
    }

    const result = aiClient.handleFixture(convertToModelMessages(messages), fixtureRecords);
    const response = result.toUIMessageStreamResponse();

    reply.raw.writeHead(response.status, Object.fromEntries(response.headers.entries()));

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
  server.post("/api/entity/chat/stream", async (request, reply) => {
    const { messages } = request.body as {
      messages: UIMessage[];
    };

    const result = aiClient.handleEntity(convertToModelMessages(messages));
    const response = result.toUIMessageStreamResponse();

    reply.raw.writeHead(response.status, Object.fromEntries(response.headers.entries()));

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
