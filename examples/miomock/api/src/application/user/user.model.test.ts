import assert from "assert";
import crypto from "crypto";

import { DB, Naite } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { UserSubsetA } from "../sonamu.generated";
import { UserModel } from "./user.model";

bootstrap(vi);

const uid = () => crypto.randomUUID();

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
      expect(userId).toMatch(/\S+/);

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

  // ============================================================
  // CDD 검증: authentication.spec.json → 인증 엔티티 스키마 + CASCADE
  // ============================================================
  describe("인증 엔티티 스키마", () => {
    test("Session 레코드 생성 (token, expires_at, ip_address, user_agent)", async () => {
      const wdb = DB.getDB("w");

      const [userResult] = await wdb("users")
        .insert({
          email: "session@test.com",
          username: "sessionuser",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const sessionId = uid();
      await wdb("sessions").insert({
        id: sessionId,
        token: "test-session-token-123",
        expires_at: new Date(Date.now() + 60 * 60 * 24 * 365 * 1000),
        ip_address: "127.0.0.1",
        user_agent: "Mozilla/5.0 Test",
        user_id: userResult.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const session = await wdb("sessions").where("id", sessionId).first();
      expect(session).toBeDefined();
      expect(session.token).toBe("test-session-token-123");
      expect(session.ip_address).toBe("127.0.0.1");
      expect(session.user_agent).toBe("Mozilla/5.0 Test");
    });

    test("Session token 유니크 인덱스", async () => {
      const wdb = DB.getDB("w");

      const [userResult] = await wdb("users")
        .insert({
          email: "session-unique@test.com",
          username: "sessionunique",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      await wdb("sessions").insert({
        id: uid(),
        token: "unique-token-test",
        expires_at: new Date(Date.now() + 86400000),
        user_id: userResult.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        wdb("sessions").insert({
          id: uid(),
          token: "unique-token-test",
          expires_at: new Date(Date.now() + 86400000),
          user_id: userResult.id,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ).rejects.toThrow();
    });

    test("Account — 1 User에 여러 외부 계정 연결 가능", async () => {
      const wdb = DB.getDB("w");

      const [userResult] = await wdb("users")
        .insert({
          email: "multi-oauth@test.com",
          username: "multioauth",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      await wdb("accounts").insert({
        id: uid(),
        account_id: "google-multi-1",
        provider_id: "google",
        user_id: userResult.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await wdb("accounts").insert({
        id: uid(),
        account_id: "github-multi-1",
        provider_id: "github",
        user_id: userResult.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const accounts = await wdb("accounts").where("user_id", userResult.id);
      expect(accounts.length).toBe(2);
    });

    test("Passkey 레코드 생성 (credential_id, device_type, backed_up)", async () => {
      const wdb = DB.getDB("w");

      const [userResult] = await wdb("users")
        .insert({
          email: "passkey@test.com",
          username: "passkeyuser",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const passkeyId = uid();
      await wdb("passkeys").insert({
        id: passkeyId,
        public_key: "test-public-key-base64",
        credential_id: "test-credential-id-123",
        counter: 0,
        device_type: "platform",
        backed_up: false,
        user_id: userResult.id,
        created_at: new Date(),
      });

      const passkey = await wdb("passkeys").where("id", passkeyId).first();
      expect(passkey.credential_id).toBe("test-credential-id-123");
      expect(passkey.device_type).toBe("platform");
      expect(passkey.backed_up).toBe(false);
    });

    test("TwoFactor 레코드 생성 (secret, backup_codes)", async () => {
      const wdb = DB.getDB("w");

      const [userResult] = await wdb("users")
        .insert({
          email: "twofactor@test.com",
          username: "twofactoruser",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const tfId = uid();
      await wdb("two_factors").insert({
        id: tfId,
        secret: "JBSWY3DPEHPK3PXP",
        backup_codes: JSON.stringify(["code1", "code2", "code3"]),
        user_id: userResult.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const tf = await wdb("two_factors").where("id", tfId).first();
      expect(tf.secret).toBe("JBSWY3DPEHPK3PXP");
      expect(JSON.parse(tf.backup_codes)).toHaveLength(3);
    });

    test("Verification 레코드 생성 (identifier, value, expires_at)", async () => {
      const wdb = DB.getDB("w");

      const vId = uid();
      await wdb("verifications").insert({
        id: vId,
        identifier: "verify@test.com",
        value: "verification-token-abc",
        expires_at: new Date(Date.now() + 3600 * 1000),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const v = await wdb("verifications").where("id", vId).first();
      expect(v.identifier).toBe("verify@test.com");
      expect(v.value).toBe("verification-token-abc");
      expect(v.expires_at).toBeDefined();
    });
  });

  // ============================================================
  // CDD 검증: Contract + authentication.spec → CASCADE 삭제
  // Contract: "삭제 시 인증 관련 데이터(세션, 패스키, 2FA)는 모두 삭제한다"
  // ============================================================
  describe("User 삭제 시 CASCADE", () => {
    test("User hard delete 시 Session, Account, Passkey, TwoFactor 모두 삭제", async () => {
      const wdb = DB.getDB("w");

      const [userResult] = await wdb("users")
        .insert({
          email: "cascade@test.com",
          username: "cascadeuser",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");
      const userId = userResult.id;

      await wdb("sessions").insert({
        id: uid(),
        token: "cascade-session-token",
        expires_at: new Date(Date.now() + 86400000),
        user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await wdb("accounts").insert({
        id: uid(),
        account_id: "cascade-google-123",
        provider_id: "google",
        user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await wdb("passkeys").insert({
        id: uid(),
        public_key: "cascade-public-key",
        credential_id: "cascade-credential-id",
        counter: 0,
        device_type: "platform",
        backed_up: false,
        user_id: userId,
        created_at: new Date(),
      });

      await wdb("two_factors").insert({
        id: uid(),
        secret: "CASCADE-SECRET",
        backup_codes: JSON.stringify(["backup1"]),
        user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 존재 확인
      expect(await wdb("sessions").where("user_id", userId)).toHaveLength(1);
      expect(await wdb("accounts").where("user_id", userId)).toHaveLength(1);
      expect(await wdb("passkeys").where("user_id", userId)).toHaveLength(1);
      expect(await wdb("two_factors").where("user_id", userId)).toHaveLength(1);

      // User hard delete → CASCADE 트리거
      await wdb("users").where("id", userId).delete();

      // 모두 삭제되었는지 확인
      expect(await wdb("sessions").where("user_id", userId)).toHaveLength(0);
      expect(await wdb("accounts").where("user_id", userId)).toHaveLength(0);
      expect(await wdb("passkeys").where("user_id", userId)).toHaveLength(0);
      expect(await wdb("two_factors").where("user_id", userId)).toHaveLength(0);
    });
  });
});

describe("User subset", () => {
  test("should expose banned/ban_reason/ban_expires in A subset", async () => {
    const subsetKeys = UserSubsetA.keyof().options;
    expect(subsetKeys).toContain("banned");
    expect(subsetKeys).toContain("ban_reason");
    expect(subsetKeys).toContain("ban_expires");

    const [userId] = await UserModel.save([
      {
        email: "subset-ban@test.com",
        username: "subsetbanuser",
        password: "password123",
        role: "normal",
      },
    ]);
    assert(userId);

    const user = await UserModel.findById("A", userId);
    expect("banned" in user).toBe(true);
    expect("ban_reason" in user).toBe(true);
    expect("ban_expires" in user).toBe(true);
    // 신규 생성 시 세 필드는 null/false 허용 범위
    expect(user.ban_reason).toBeNull();
    expect(user.ban_expires).toBeNull();
  });
});
