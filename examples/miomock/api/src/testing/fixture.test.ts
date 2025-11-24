import { describe, expect, test, vi } from "vitest";
import { CompanyModel } from "../application/company/company.model";
import { bootstrap } from "../testing/bootstrap";

bootstrap(vi);
describe("픽스쳐", () => {
  test("전체 픽스쳐 테스트", async () => {
    // const f = await loadFixtures(["company01"]);

    // expect(f.company01.id).toBe(1);
    // expect(f.company01.created_at).toBeInstanceOf(Date);
    // expect(f.company01.name).toBe("C1");

    const c = await CompanyModel.findById("A", 1);
    expect(c.id).toBe(1);
    expect(c.created_at).toBeInstanceOf(Date);
    expect(c.name).toBe("C1");
  });
});
