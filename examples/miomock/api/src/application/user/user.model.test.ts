import assert from "assert";
import { DB, Naite } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
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

  // ============================================================
  // CDD 검증: user.spec.json → 회원가입
  // ============================================================
  describe("회원가입", () => {
    test("save로 이메일/비밀번호/이름 기반 사용자 생성", async () => {
      const [userId] = await UserModel.save([
        {
          email: "signup@test.com",
          username: "signupuser",
          password: "hashedpassword123",
          role: "normal",
        },
      ]);
      assert(userId);

      // ID가 문자열 타입으로 반환되어야 함 (Spec: Technical Constraints)
      expect(typeof userId).toBe("string");

      // 생성된 유저 조회
      const user = await UserModel.findById("A", userId);
      expect(user.email).toBe("signup@test.com");
      expect(user.username).toBe("signupuser");
    });

    test("중복 이메일 저장 시 유니크 제약 위반 에러", async () => {
      // 첫 번째 유저 생성
      await UserModel.save([
        {
          email: "duplicate@test.com",
          username: "user1",
          password: "password123",
          role: "normal",
        },
      ]);

      // 같은 이메일로 두 번째 유저 생성 시 에러
      await expect(
        UserModel.save([
          {
            email: "duplicate@test.com",
            username: "user2",
            password: "password456",
            role: "normal",
          },
        ]),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // CDD 검증: user.spec.json → 사용자 프로필
  // ============================================================
  describe("사용자 프로필", () => {
    test("findById로 사용자 단건 조회", async () => {
      const [userId] = await UserModel.save([
        {
          email: "profile@test.com",
          username: "profileuser",
          password: "password123",
          role: "normal",
        },
      ]);
      assert(userId);

      const user = await UserModel.findById("A", userId);
      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
      expect(user.email).toBe("profile@test.com");
    });

    test("존재하지 않는 사용자 조회 시 NotFoundException", async () => {
      await expect(UserModel.findById("A", "999999")).rejects.toThrow();
    });

    test("findMany로 사용자 목록 조회 (페이지네이션)", async () => {
      const result = await UserModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    test("save로 기존 사용자 프로필 수정", async () => {
      const [userId] = await UserModel.save([
        {
          email: "edit@test.com",
          username: "edituser",
          password: "password123",
          role: "normal",
        },
      ]);
      assert(userId);

      const createdUser = await UserModel.findById("A", userId);

      // 프로필 수정
      await UserModel.save([
        {
          ...createdUser,
          username: "edited_username",
          password: "password123",
        },
      ]);

      const updatedUser = await UserModel.findById("A", userId);
      expect(updatedUser.username).toBe("edited_username");
    });
  });

  // ============================================================
  // CDD 검증: user.spec.json → 계정 삭제
  // Spec: "deleted_at을 설정하여 계정을 비활성 상태로 전환한다" (soft delete)
  // ============================================================
  describe("계정 삭제", () => {
    test("del은 soft delete (deleted_at 설정)", async () => {
      const wdb = DB.getDB("w");

      const [userId] = await UserModel.save([
        {
          email: "softdel@test.com",
          username: "softdeluser",
          password: "password123",
          role: "normal",
        },
      ]);
      assert(userId);

      // 삭제 실행
      await UserModel.del([userId]);

      // soft delete이므로 DB에 레코드가 남아있어야 함
      const row = await wdb("users").where("id", userId).first();
      expect(row).toBeDefined();
      expect(row.deleted_at).not.toBeNull();
    });

    test("soft delete된 사용자는 findMany에서 제외", async () => {
      const wdb = DB.getDB("w");

      const [userId] = await UserModel.save([
        {
          email: "hidden@test.com",
          username: "hiddenuser",
          password: "password123",
          role: "normal",
        },
      ]);
      assert(userId);

      // soft delete
      await wdb("users").where("id", userId).update({ deleted_at: new Date() });

      // findMany에서 조회되지 않아야 함
      const result = await UserModel.findMany("A", {
        id: userId,
        num: 1,
        page: 1,
      });
      expect(result.rows.length).toBe(0);
    });
  });
});
