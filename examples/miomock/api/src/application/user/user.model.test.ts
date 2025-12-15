import { Naite } from "sonamu";
import { describe, expect, vi } from "vitest";
import { bootstrap, test } from "../../testing/bootstrap";
import { UserModel } from "./user.model";

bootstrap(vi);
describe("UserModel", () => {
  describe("BaseModel 기본 기능 확인", () => {
    test("Model.findMany() with num = 0", async () => {
      // num: 0 으로 전체 쿼리
      await UserModel.findMany("A", {
        num: 0,
        page: 1,
      });

      // 쿼리에 limit과 offset이 없어야 함
      expect(Naite.get("esq-query").first()).not.contain("limit");
      expect(Naite.get("esq-query").first()).not.contain("offset");
    });
  });
});
