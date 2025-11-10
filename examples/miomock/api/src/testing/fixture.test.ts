import { bootstrap } from "../testing/bootstrap";
import { describe, expect, test } from "vitest";
import { loadFixtures } from "./fixture";

bootstrap(["companies"]);
describe("픽스쳐", () => {
  test("전체 픽스쳐 테스트", async () => {
    const f = await loadFixtures(["company01"]);

    expect(f.company01.id).toBe(1);
    expect(f.company01.created_at).toBe("2025-10-24T05:50:32.000Z");
    expect(f.company01.name).toBe("테크놀로지 주식회사");
  });
});
