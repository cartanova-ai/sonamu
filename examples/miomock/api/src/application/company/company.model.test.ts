import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { loadFixtures } from "../../testing/fixture";
import { CompanyModel } from "./company.model";

bootstrap(vi);
describe("CompanyModelTest", () => {
  test("Save - Update", async () => {
    const f0 = await loadFixtures(["company01"]);

    // update 케이스
    await CompanyModel.save([
      {
        ...f0.company01,
        name: "Updated Company",
      },
    ]);

    const f1 = await loadFixtures(["company01"]);
    expect(f1.company01).toBeDefined();
    expect(f1.company01.name).toBe("Updated Company");
  });
});
