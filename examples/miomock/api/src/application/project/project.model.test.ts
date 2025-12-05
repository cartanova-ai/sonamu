import { type Context, Naite } from "sonamu";
import { assert, describe, test, vi } from "vitest";
import { bootstrap, runWithContext } from "../../testing/bootstrap";
import { ProjectModel } from "./project.model";
import type { ProjectAskStreamEvents } from "./project.types";

bootstrap(vi);
describe("ProjectModel", () => {
  test("ask", { timeout: 0, skip: true }, async () => {
    const events: Set<keyof ProjectAskStreamEvents> = new Set();
    await runWithContext(
      {
        ip: "127.0.0.1",
        session: {},
        user: null,
        passport: {
          login: async () => {},
          logout: () => {},
        },
        naiteStore: Naite.createStore(),
        createSSE: vi.fn().mockImplementation(() => {
          return {
            publish: vi.fn().mockImplementation((event, _data) => {
              events.add(event);
            }),
            end: vi.fn().mockImplementation(() => Promise.resolve()),
          };
        }),
      } as unknown as Context,
      async () => {
        await ProjectModel.ask("지금 어떤 프로젝트들이 등록되어 있나요?");

        const toolCalls = Naite.get("project.agent.fetchProjects").result();
        const fullText = Naite.get("project.ask.fullText").first();
        const tokens = Naite.get("project.ask.token").result();

        assert.isArray(toolCalls);
        assert.lengthOf(toolCalls, 1);

        assert.isString(fullText);
        assert.isNotEmpty(tokens);
        assert.strictEqual(fullText, tokens.join(""));
      },
    );
  });
});
