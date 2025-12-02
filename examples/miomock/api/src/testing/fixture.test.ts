import { describe, expect, vi } from "vitest";
import { bootstrap, test } from "./bootstrap";
import { loadFixtures } from "./fixture";

bootstrap(vi);
describe("픽스쳐", () => {
  test("전체 픽스쳐 테스트", async () => {
    const f = await loadFixtures(["company01"]);

    expect(f.company01.id).toBe(1);
    expect(f.company01.created_at).toBeInstanceOf(Date);
    expect(f.company01.name).toBe("테크놀로지 주식회사");
  });
});
