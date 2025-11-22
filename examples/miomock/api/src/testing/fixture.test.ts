import { describe, expect, test } from "vitest";
import { bootstrap } from "../testing/bootstrap";
import { loadFixtures } from "./fixture";

bootstrap();
describe("픽스쳐", () => {
  test("전체 픽스쳐 테스트", async () => {
    const f = await loadFixtures(["company01"]);

    expect(f.company01.id).toBe(1);
    expect(f.company01.created_at).toBeInstanceOf(Date);
    expect(f.company01.name).toBe("C1");
  });
});
