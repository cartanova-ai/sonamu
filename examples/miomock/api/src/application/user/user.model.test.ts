import assert from "assert";
import { Naite } from "sonamu";
import { bootstrap, test, testAs } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import type { UserSubsetSS } from "../sonamu.generated";
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

  describe("CRUD 테스트", () => {
    test("Create - save로 새 유저 생성", async () => {
      const [userId] = await UserModel.save([
        {
          email: "newuser@test.com",
          username: "newuser",
          password: "hashedpassword123",
          role: "normal",
        },
      ]);
      assert(userId);

      // 생성된 유저 확인
      const user = await UserModel.findById("A", userId);
      expect(user.email).toBe("newuser@test.com");
      expect(user.username).toBe("newuser");
    });

    test("Read - findById로 유저 조회", async () => {
      // fixture에 있는 유저 조회 (id: 1)
      const user = await UserModel.findById("A", 1);

      expect(user).toBeDefined();
      expect(user.id).toBe(1);
    });

    test("Read - findMany로 유저 목록 조회", async () => {
      const result = await UserModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
    });

    test("Update - save로 기존 유저 수정", async () => {
      // 먼저 유저 생성
      const [userId] = await UserModel.save([
        {
          email: "updatetest@test.com",
          username: "updatetest",
          password: "password123",
          role: "normal",
        },
      ]);
      assert(userId);

      const createdUser = await UserModel.findById("A", userId);

      // 유저 수정
      await UserModel.save([
        {
          ...createdUser,
          username: "updated_username",
          password: "password123",
        },
      ]);

      // 수정 확인
      const updatedUser = await UserModel.findById("A", userId);
      expect(updatedUser.username).toBe("updated_username");
    });
  });

  describe("me - 로그인된 유저 정보 조회", () => {
    const adminUser: UserSubsetSS = {
      id: 1,
      created_at: new Date(),
      email: "admin@test.com",
      username: "admin",
      role: "admin",
      is_verified: true,
      last_login_at: null,
      bio: null,
    };

    testAs(adminUser, "로그인된 유저 정보 조회", async () => {
      const me = await UserModel.me();

      expect(me).not.toBeNull();
      expect(me?.id).toBe(adminUser.id);
    });

    test("비로그인 시 null 반환", async () => {
      const me = await UserModel.me();

      expect(me).toBeNull();
    });
  });
});
