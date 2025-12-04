import assert from "assert";
import type { Knex } from "knex";
import { describe, expect, vi } from "vitest";
import { UserModel } from "../application/user/user.model";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);

describe("Puri Wrapper", () => {
  describe("A. 쿼리 빌더 래퍼", () => {
    test("from()", async () => {
      const wdb = UserModel.getPuri("w");
      const rdb = UserModel.getPuri("r");
      const testEmail = "from-test@test.com";

      const [userId] = await wdb.table("users").insert({
        email: testEmail,
        username: "from_test_user",
        password: "pw",
        role: "normal",
      });

      assert(userId);

      // from()이 Puri 객체를 반환하는지 확인
      const puriQuery = rdb.from("users");
      expect(puriQuery).toBeInstanceOf(Puri);

      // Puri 메서드 체이닝 확인
      const users = await puriQuery
        .select({ email: "users.email", username: "users.username" })
        .where("users.id", userId)
        .orderBy("users.id", "asc")
        .limit(1);

      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ email: testEmail, username: "from_test_user" });
      expect(users[0]).not.toHaveProperty("password");
    });

    test("table()", async () => {
      const wdb = UserModel.getPuri("w");
      const rdb = UserModel.getPuri("r");
      const testEmail = "table-test@test.com";

      const [userId] = await wdb.table("users").insert({
        email: testEmail,
        username: "table_test_user",
        password: "pw",
        role: "admin",
      });

      assert(userId);

      // table()이 Puri 객체를 반환하는지 확인
      const puriQuery = rdb.table("users");
      expect(puriQuery).toBeInstanceOf(Puri);

      // Puri 메서드 체이닝 확인
      const users = await puriQuery
        .selectAll()
        .where("users.id", userId)
        .orderBy("users.id", "desc");

      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ email: testEmail, username: "table_test_user" });
    });

    test("raw()", async () => {
      const wdb = UserModel.getPuri("w");
      const rdb = UserModel.getPuri("r");
      const testEmail = "raw-test@test.com";

      // raw SQL로 INSERT 실행
      await wdb.knex.raw(
        `INSERT INTO users (email, username, password, role) VALUES (?, ?, ?, ?)`,
        [testEmail, "raw_user", "pw", "normal"],
      );

      // PuriWrapper가 Knex를 감싸고 있음을 확인
      const [users] = await rdb.knex.raw(`SELECT * FROM users WHERE email = ?`, [testEmail]);

      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: testEmail,
        username: "raw_user",
      });
    });
  });

  describe("B. 트랜잭션 관리", () => {
    describe("B-1. 기본 트랜잭션", () => {
      test("트랜잭션 생성 및 자동 커밋", async () => {
        const wdb = UserModel.getPuri("w");
        let insertedUserId: number | undefined;

        // 트랜잭션 내에서 user 생성
        await wdb.transaction(async (trx) => {
          const [userId] = await trx.table("users").insert({
            email: "transaction-basic@test.com",
            username: "transaction_basic",
            password: "pw",
            role: "normal",
          });

          expect(userId).toBeGreaterThan(0);
          insertedUserId = userId;
        });

        // 자동 커밋 확인 - 트랜잭션 외부에서 데이터 조회 가능
        const rdb = UserModel.getPuri("r");
        const user = await rdb.table("users").where("email", "transaction-basic@test.com").first();

        expect(user).toMatchObject({
          id: insertedUserId,
          email: "transaction-basic@test.com",
          username: "transaction_basic",
        });
      });

      test("트랜잭션 내에서 SELECT 쿼리 실행", async () => {
        const wdb = UserModel.getPuri("w");

        // user 생성
        const [userId] = await wdb.table("users").insert({
          email: "trx-select@test.com",
          username: "trx_select",
          password: "pw",
          role: "admin",
        });

        assert(userId);

        // 트랜잭션 내에서 SELECT 쿼리 실행
        await wdb.transaction(async (trx) => {
          const user = await trx.table("users").where("id", userId).first();

          // 트랜잭션 내에서 데이터 정상 조회 확인
          expect(user).toMatchObject({
            id: userId,
            email: "trx-select@test.com",
            username: "trx_select",
            role: "admin",
          });
        });
      });

      test("트랜잭션 내에서 INSERT/UPDATE 쿼리 실행", async () => {
        const wdb = UserModel.getPuri("w");

        // user 생성
        const [userId] = await wdb.table("users").insert({
          email: "trx-update@test.com",
          username: "original_name",
          password: "pw",
          role: "normal",
        });

        assert(userId);

        // 트랜잭션 내에서 UPDATE 실행
        await wdb.transaction(async (trx) => {
          await trx.table("users").where("id", userId).update({
            username: "updated_name",
            bio: "Updated in transaction",
          });

          // 트랜잭션 내에서 변경사항 확인
          const userInTrx = await trx.table("users").where("id", userId).first();

          expect(userInTrx).toMatchObject({
            id: userId,
            username: "updated_name",
            bio: "Updated in transaction",
          });
        });

        // 트랜잭션 외부에서 커밋 확인
        const rdb = UserModel.getPuri("r");
        const user = await rdb.table("users").where("id", userId).first();

        expect(user).toMatchObject({
          id: userId,
          username: "updated_name",
          bio: "Updated in transaction",
        });
      });

      test("에러 발생 시 자동 rollback", async () => {
        const wdb = UserModel.getPuri("w");

        // 트랜잭션 내에서 INSERT 후 에러 발생
        await expect(
          wdb.transaction(async (trx) => {
            await trx.table("users").insert({
              email: "rollback-test@test.com",
              username: "rollback_test",
              password: "pw",
              role: "normal",
            });

            // 의도적으로 에러 발생
            throw new Error("Intentional error for rollback test");
          }),
        ).rejects.toThrow("Intentional error for rollback test");

        // 롤백 확인 - 데이터가 존재하지 않아야 함
        const rdb = UserModel.getPuri("r");
        const user = await rdb.table("users").where("email", "rollback-test@test.com").first();

        expect(user).toBeUndefined();
      });
    });

    describe("B-2. 중첩 트랜잭션 (SAVEPOINT)", () => {
      test("중첩 트랜잭션 기본", async () => {
        const wdb = UserModel.getPuri("w");
        const outerEmail = "nested-outer@test.com";
        const innerEmail = "nested-inner@test.com";

        await wdb.transaction(async (trx1) => {
          // 외부 트랜잭션에서 첫 번째 user 생성
          const [userId1] = await trx1.table("users").insert({
            email: outerEmail,
            username: "outer_user",
            password: "pw",
            role: "normal",
          });

          assert(userId1);

          // 중첩 트랜잭션 (SAVEPOINT 생성)
          await trx1.transaction(async (trx2) => {
            // 내부 트랜잭션에서 두 번째 user 생성
            const [userId2] = await trx2.table("users").insert({
              email: innerEmail,
              username: "inner_user",
              password: "pw",
              role: "normal",
            });

            assert(userId2);

            // 내부 트랜잭션에서 데이터 확인
            const innerUser = await trx2.table("users").where("id", userId2).first();
            expect(innerUser).toMatchObject({ email: innerEmail });
          });

          // 외부 트랜잭션에서 두 user 모두 확인
          const users = await trx1.table("users").whereIn("email", [outerEmail, innerEmail]);

          expect(users).toHaveLength(2);
          const emails = users.map((u) => u.email);
          expect(emails).toContain(outerEmail);
          expect(emails).toContain(innerEmail);
        });

        // 트랜잭션 완료 후 두 user 모두 커밋되었는지 확인
        const rdb = UserModel.getPuri("r");
        const users = await rdb.table("users").whereIn("email", [outerEmail, innerEmail]);

        expect(users).toHaveLength(2);
        const emails = users.map((u) => u.email);
        expect(emails).toContain(outerEmail);
        expect(emails).toContain(innerEmail);
      });

      test("내부 트랜잭션 rollback - 외부는 유지", async () => {
        const wdb = UserModel.getPuri("w");
        const outerEmail = "nested-outer@test.com";
        const innerEmail = "nested-inner@test.com";

        await wdb.transaction(async (trx1) => {
          // 외부 트랜잭션에서 user 생성
          const [userId1] = await trx1.table("users").insert({
            email: outerEmail,
            username: "outer_user",
            password: "pw",
            role: "normal",
          });

          assert(userId1);

          // 중첩 트랜잭션에서 에러 발생 → 내부만 롤백
          await expect(
            trx1.transaction(async (trx2) => {
              await trx2.table("users").insert({
                email: innerEmail,
                username: "inner_user",
                password: "pw",
                role: "normal",
              });

              throw new Error("Inner transaction error");
            }),
          ).rejects.toThrow("Inner transaction error");

          // 외부 user는 존재, 내부 user는 롤백됨
          const [outer, inner] = await Promise.all([
            trx1.table("users").where("email", outerEmail).first(),
            trx1.table("users").where("email", innerEmail).first(),
          ]);

          expect(outer).toMatchObject({ email: outerEmail });
          expect(inner).toBeUndefined();
        });

        // 커백 후 확인: 외부만 유지, 내부는 롤백
        const rdb = UserModel.getPuri("r");
        const [outer, inner] = await Promise.all([
          rdb.table("users").where("email", outerEmail).first(),
          rdb.table("users").where("email", innerEmail).first(),
        ]);

        expect(outer).toMatchObject({ email: outerEmail });
        expect(inner).toBeUndefined();
      });

      test("외부 트랜잭션 에러 - 전체 rollback", async () => {
        const wdb = UserModel.getPuri("w");
        const outerEmail = "nested-outer-error@test.com";
        const innerEmail = "nested-inner-error@test.com";

        // 외부 트랜잭션에서 에러 발생 → 전체 롤백
        const transactionPromise = wdb.transaction(async (trx1) => {
          // 외부 트랜잭션에서 user 생성
          await trx1.table("users").insert({
            email: outerEmail,
            username: "outer_error",
            password: "pw",
            role: "normal",
          });

          // 중첩 트랜잭션에서 user 생성
          await trx1.transaction(async (trx2) => {
            await trx2.table("users").insert({
              email: innerEmail,
              username: "inner_error",
              password: "pw",
              role: "normal",
            });
          });

          // 외부 트랜잭션에서 의도적으로 에러 발생
          throw new Error("Outer transaction error");
        });

        await expect(transactionPromise).rejects.toThrow("Outer transaction error");

        // 전체 롤백 확인 - 두 user 모두 없어야 함
        const rdb = UserModel.getPuri("r");
        const [outer, inner] = await Promise.all([
          rdb.table("users").where("email", outerEmail).first(),
          rdb.table("users").where("email", innerEmail).first(),
        ]);

        expect(outer).toBeUndefined();
        expect(inner).toBeUndefined();
      });

      test("3단계 이상 중첩 트랜잭션", async () => {
        const wdb = UserModel.getPuri("w");
        const email1 = "nested-level1@test.com";
        const email2 = "nested-level2@test.com";
        const email3 = "nested-level3@test.com";

        await wdb.transaction(async (trx1) => {
          // 1단계: 외부 트랜잭션에서 user 생성
          await trx1.table("users").insert({
            email: email1,
            username: "level1_user",
            password: "pw",
            role: "normal",
          });

          // 2단계: 중첩 트랜잭션
          await trx1.transaction(async (trx2) => {
            await trx2.table("users").insert({
              email: email2,
              username: "level2_user",
              password: "pw",
              role: "normal",
            });

            // 3단계: 중첩 트랜잭션
            await trx2.transaction(async (trx3) => {
              await trx3.table("users").insert({
                email: email3,
                username: "level3_user",
                password: "pw",
                role: "normal",
              });

              // 3단계에서 데이터 확인
              const user3 = await trx3.table("users").where("email", email3).first();
              expect(user3).toMatchObject({ email: email3 });
            });

            // 2단계에서 2, 3단계 데이터 확인
            const users = await trx2.table("users").whereIn("email", [email2, email3]);

            expect(users).toHaveLength(2);
            const emails = users.map((u) => u.email);
            expect(emails).toContain(email2);
            expect(emails).toContain(email3);
          });

          // 1단계에서 모든 데이터 확인
          const users = await trx1.table("users").whereIn("email", [email1, email2, email3]);

          expect(users).toHaveLength(3);
          const emails = users.map((u) => u.email);
          expect(emails).toContain(email1);
          expect(emails).toContain(email2);
          expect(emails).toContain(email3);
        });

        // 트랜잭션 완료 후 모든 user 커밋 확인
        const rdb = UserModel.getPuri("r");
        const users = await rdb.table("users").whereIn("email", [email1, email2, email3]);

        expect(users).toHaveLength(3);
        const emails = users.map((u) => u.email);
        expect(emails).toContain(email1);
        expect(emails).toContain(email2);
        expect(emails).toContain(email3);
      });
    });

    describe("B-3. 트랜잭션 옵션", () => {
      // 실제 isolation level 동작 검증(Dirty Read 등)은 두 개의 독립적인 DB 연결이 필요
      // isolation level 옵션 전달과 기본 동작만 확인
      test("isolation 옵션 전달 확인", async () => {
        const wdb = UserModel.getPuri("w");
        const isolationLevels: Array<Exclude<Knex.IsolationLevels, "snapshot">> = [
          "read uncommitted",
          "read committed",
          "repeatable read",
          "serializable",
        ];

        // 각 isolation level에 대해 옵션 전달 및 트랜잭션 동작 확인
        for (const isolation of isolationLevels) {
          const testEmail = `isolation-${isolation.replace(/\s+/g, "-")}@test.com`;

          await wdb.transaction(
            async (trx) => {
              // 트랜잭션 내에서 user 생성
              await trx.table("users").insert({
                email: testEmail,
                username: `isolation_${isolation.replace(/\s+/g, "_")}`,
                password: "pw",
                role: "normal",
              });

              // 트랜잭션 내에서 데이터 조회 가능 확인
              const user = await trx.table("users").where("email", testEmail).first();
              expect(user).toMatchObject({ email: testEmail });
            },
            { isolation },
          );

          // 트랜잭션 완료 후 데이터 커밋 확인
          const rdb = UserModel.getPuri("r");
          const user = await rdb.table("users").where("email", testEmail).first();
          expect(user).toMatchObject({ email: testEmail });
        }
      });

      /**
       *  TODO: readOnly: true 옵션이 전달되고 트랜잭션이 정상 동작하는지 확인 필요
       *  참고: MySQL의 readOnly 트랜잭션은 트랜잭션 시작 전에 SET TRANSACTION READ ONLY를 실행해야 하는데,
       *  Knex의 transaction() 메서드는 트랜잭션 시작 후 콜백을 실행하므로 완벽한 지원이 어렵습니다.
       */
      test("readOnly 옵션- true", async () => {
        const wdb = UserModel.getPuri("w");
        const testEmail = "readonly-test@test.com";

        // readOnly 트랜잭션 외부에서 user 생성
        const [userId] = await wdb.table("users").insert({
          email: testEmail,
          username: "readonly_user",
          password: "pw",
          role: "normal",
        });

        assert(userId);

        // readOnly: true 트랜잭션에서 SELECT 정상 동작
        await wdb.transaction(
          async (trx) => {
            const user = await trx.table("users").where("id", userId).first();
            expect(user).toMatchObject({ id: userId, email: testEmail });
          },
          { readOnly: true },
        );

        await wdb.transaction(
          async (trx) => {
            const user = await trx.table("users").where("id", userId).first();
            expect(user).toMatchObject({ id: userId, email: testEmail });
          },
          { readOnly: true },
        );
      });

      test.todo("readOnly 옵션- false");
    });

    describe("B-4. PuriTransactionWrapper", () => {
      test("수동 롤백 - rollback()", async () => {
        const wdb = UserModel.getPuri("w");
        const rdb = UserModel.getPuri("r");
        const testEmail = "manual-rollback@test.com";

        await wdb.transaction(async (trx) => {
          // 트랜잭션 내에서 user 생성
          await trx.table("users").insert({
            email: testEmail,
            username: "manual_rollback",
            password: "pw",
            role: "normal",
          });

          // 트랜잭션 내에서 데이터 확인
          const user = await trx.table("users").where("email", testEmail).first();
          expect(user).toMatchObject({ email: testEmail });

          // 즉시 수동 롤백
          await trx.rollback();

          // 롤백 직후 일반 연결(rdb)로 접근 시 데이터 없음
          const userFromRdb = await rdb.table("users").where("email", testEmail).first();
          expect(userFromRdb).toBeUndefined();

          // 롤백된 트랜잭션 재사용 시도하면 에러 발생
          await expect(
            trx.table("users").insert({
              email: "should-fail@test.com",
              username: "fail_user",
              password: "pw",
              role: "normal",
            }),
          ).rejects.toThrow();
        });

        // 최종 확인: 롤백되어 데이터 없음
        const finalUser = await rdb.table("users").where("email", testEmail).first();
        expect(finalUser).toBeUndefined();
      });

      test("수동 커밋 - commit()", async () => {
        const wdb = UserModel.getPuri("w");
        const rdb = UserModel.getPuri("r");
        const testEmail = "early-commit@test.com";

        await wdb.transaction(async (trx) => {
          // 트랜잭션 내에서 user 생성
          await trx.table("users").insert({
            email: testEmail,
            username: "early_user",
            password: "pw",
            role: "normal",
          });

          // 즉시 수동 커밋
          await trx.commit();

          // 트랜잭션 콜백은 아직 실행 중이지만, 이미 커밋되어 rdb로 접근 가능
          const userFromRdb = await rdb.table("users").where("email", testEmail).first();

          expect(userFromRdb).toMatchObject({
            email: testEmail,
            username: "early_user",
          });

          // 커밋된 트랜잭션 재사용 시도시 에러 발생
          await expect(
            trx.table("users").insert({
              email: "should-fail@test.com",
              username: "fail_user",
              password: "pw",
              role: "normal",
            }),
          ).rejects.toThrow();
        });

        // 최종 확인: 정상 커밋된 데이터만 존재
        const committedUser = await rdb.table("users").where("email", testEmail).first();
        const failedUser = await rdb.table("users").where("email", "should-fail@test.com").first();

        expect(committedUser).toMatchObject({ email: testEmail });
        expect(failedUser).toBeUndefined();
      });

      test("상속 확인 - from()/table() 동작", async () => {
        const wdb = UserModel.getPuri("w");
        const testEmail = "inheritance-test@test.com";

        // 트랜잭션 시작
        await wdb.transaction(async (trx) => {
          // table() 메서드로 INSERT 정상 동작 확인
          await trx.table("users").insert({
            email: testEmail,
            username: "inheritance_user",
            password: "pw",
            role: "normal",
          });

          // from() 메서드로 SELECT 정상 동작 확인
          const userViaFrom = await trx.from("users").where("email", testEmail).first();
          expect(userViaFrom).toMatchObject({ email: testEmail });

          // table() 메서드로 UPDATE 정상 동작 확인
          await trx.table("users").where("email", testEmail).update({ username: "updated_user" });
          const updatedUser = await trx.from("users").where("email", testEmail).first();
          expect(updatedUser).toMatchObject({ email: testEmail, username: "updated_user" });
        });

        // 트랜잭션 완료 후 데이터 확인
        const rdb = UserModel.getPuri("r");
        const user = await rdb.table("users").where("email", testEmail).first();
        expect(user).toMatchObject({ email: testEmail });
      });
    });
  });

  /**
   * UpsertBuilder는 상태를 유지하는 객체
   * - 트랜잭션 밖에서 등록한 데이터도 트랜잭션 내에서 사용 가능
   * - 트랜잭션 내부의 PuriTransactionWrapper가 같은 UpsertBuilder 인스턴스를 공유하기 때문
   * - 실제 DB 작업(ubUpsert, ubUpdateBatch)은 트랜잭션 내에서 실행되어 원자성을 보장
   */
  describe("C. UpsertBuilder 통합", () => {
    test("트랜잭션 내 ubRegister + ubUpsert", async () => {
      const wdb = UserModel.getPuri("w");
      const rdb = UserModel.getPuri("r");
      const testData = [
        { email: "ub-trx-1@test.com", username: "ub_user_1" },
        { email: "ub-trx-2@test.com", username: "ub_user_2" },
        { email: "ub-trx-3@test.com", username: "ub_user_3" },
      ];
      const testEmails = testData.map((d) => d.email);

      // 트랜잭션 밖에서 ubRegister로 데이터 등록
      for (const data of testData) {
        wdb.ubRegister("users", {
          ...data,
          password: "pw",
          role: "normal",
        });
      }

      // 트랜잭션 내에서 ubUpsert로 실제 DB에 저장
      let insertedIds: number[];
      await wdb.transaction(async (trx) => {
        insertedIds = await trx.ubUpsert("users");

        // 트랜잭션 내에서 데이터 확인
        expect(insertedIds).toHaveLength(3);
        insertedIds.forEach((id) => {
          expect(id).toBeGreaterThan(0);
        });

        // 트랜잭션 내에서 조회 가능
        const usersInTrx = await trx
          .table("users")
          .whereIn("email", testEmails)
          .orderBy("email", "asc");
        expect(usersInTrx).toHaveLength(3);
        expect(usersInTrx).toMatchObject([
          { email: testData[0]?.email, username: "ub_user_1" },
          { email: testData[1]?.email, username: "ub_user_2" },
          { email: testData[2]?.email, username: "ub_user_3" },
        ]);
      });

      // 트랜잭션 완료 후 데이터 확인
      const users = await rdb.table("users").whereIn("email", testEmails).orderBy("email", "asc");
      expect(users).toHaveLength(3);
      expect(users).toMatchObject([
        { email: testData[0]?.email, username: "ub_user_1" },
        { email: testData[1]?.email, username: "ub_user_2" },
        { email: testData[2]?.email, username: "ub_user_3" },
      ]);
    });

    test("트랜잭션 내 ubUpdateBatch", async () => {
      const wdb = UserModel.getPuri("w");
      const rdb = UserModel.getPuri("r");
      const initialData = [
        { email: "batch-update-1@test.com", username: "원본1" },
        { email: "batch-update-2@test.com", username: "원본2" },
        { email: "batch-update-3@test.com", username: "원본3" },
      ];
      const initialEmails = initialData.map((d) => d.email);

      // 트랜잭션 밖에서 ubRegister로 초기 데이터 등록
      for (const data of initialData) {
        wdb.ubRegister("users", {
          ...data,
          password: "pw",
          role: "normal",
        });
      }

      // 트랜잭션 내에서 ubUpsert + ubUpdateBatch
      const insertedIds = await wdb.transaction(async (trx) => {
        // ubUpsert로 사용자 생성
        const ids = await trx.ubUpsert("users");

        // 트랜잭션 내에서 생성 확인
        expect(ids).toHaveLength(3);
        ids.forEach((id) => {
          expect(id).toBeGreaterThan(0);
        });

        // 트랜잭션 내에서 원본 데이터 확인
        const originalUsers = await trx
          .table("users")
          .whereIn("email", initialEmails)
          .orderBy("email", "asc");
        expect(originalUsers).toHaveLength(3);
        expect(originalUsers).toMatchObject([
          { email: initialData[0]?.email, username: "원본1", role: "normal" },
          { email: initialData[1]?.email, username: "원본2", role: "normal" },
          { email: initialData[2]?.email, username: "원본3", role: "normal" },
        ]);

        // 업데이트할 데이터를 ubRegister로 등록
        const sortedIds = [...ids].sort((a, b) => a - b);
        for (const [index, id] of sortedIds.entries()) {
          trx.ubRegister("users", {
            id,
            username: `수정됨${index + 1}`,
            role: "admin",
          });
        }

        // ubUpdateBatch로 일괄 업데이트
        await trx.ubUpdateBatch("users", {
          chunkSize: 100,
          where: "id",
        });

        // 트랜잭션 내에서 업데이트 결과 확인
        const updatedUsersInTrx = await trx.table("users").whereIn("id", ids).orderBy("id", "asc");

        expect(updatedUsersInTrx).toHaveLength(3);
        expect(updatedUsersInTrx).toMatchObject([
          { id: sortedIds[0], username: "수정됨1", role: "admin" },
          { id: sortedIds[1], username: "수정됨2", role: "admin" },
          { id: sortedIds[2], username: "수정됨3", role: "admin" },
        ]);

        return ids;
      });

      // 트랜잭션 완료 후 데이터 확인
      const sortedIds = [...insertedIds].sort((a, b) => a - b);
      const updatedUsers = await rdb.table("users").whereIn("id", insertedIds).orderBy("id", "asc");

      expect(updatedUsers).toHaveLength(3);
      expect(updatedUsers).toMatchObject([
        { id: sortedIds[0], username: "수정됨1", role: "admin" },
        { id: sortedIds[1], username: "수정됨2", role: "admin" },
        { id: sortedIds[2], username: "수정됨3", role: "admin" },
      ]);
    });

    test("트랜잭션 에러 시 ubUpsert 롤백", async () => {
      const wdb = UserModel.getPuri("w");
      const rdb = UserModel.getPuri("r");
      const testData = [
        { email: "ub-rollback-1@test.com", username: "ub_rollback_1" },
        { email: "ub-rollback-2@test.com", username: "ub_rollback_2" },
      ];
      const testEmails = testData.map((d) => d.email);

      // 트랜잭션 밖에서 ubRegister로 데이터 등록
      for (const data of testData) {
        wdb.ubRegister("users", {
          ...data,
          password: "pw",
          role: "normal",
        });
      }

      // 트랜잭션 내에서 ubUpsert 실행 후 에러 발생
      await expect(
        wdb.transaction(async (trx) => {
          // ubUpsert로 데이터 저장
          const insertedIds = await trx.ubUpsert("users");

          expect(insertedIds).toHaveLength(2);
          insertedIds.forEach((id) => {
            expect(id).toBeGreaterThan(0);
          });

          // 트랜잭션 내에서 데이터 확인
          const usersInTrx = await trx
            .table("users")
            .whereIn("email", testEmails)
            .orderBy("email", "asc");
          expect(usersInTrx).toHaveLength(2);

          // 의도적으로 에러 발생
          throw new Error("Intentional error for ubUpsert rollback test");
        }),
      ).rejects.toThrow("Intentional error for ubUpsert rollback test");

      // 롤백 확인 - 데이터가 존재하지 않음
      const users = await rdb.table("users").whereIn("email", testEmails);
      expect(users).toHaveLength(0);
    });
  });
});
