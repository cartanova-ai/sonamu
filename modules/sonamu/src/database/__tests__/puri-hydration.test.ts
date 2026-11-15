import { knex, type Knex } from "knex";
import { afterAll, describe, expect, it, vi } from "vitest";

import { Puri } from "../puri";

type Schema = { users: { id: number; name: string; nickname: string | null; payload: object } };
const db = knex({ client: "pg" });
const query = () => new Puri<Schema, Schema, Schema["users"]>(db, "users");

type RawRow = { [column: string]: string | number | boolean | null | RawRow[] };

function result(builder: Knex.QueryBuilder, rows: RawRow | RawRow[] | undefined) {
  vi.spyOn(builder, "then").mockImplementation((fulfilled, rejected) =>
    Promise.resolve(rows).then(fulfilled, rejected),
  );
}

afterAll(() => db.destroy());

describe("Puri 중첩 select 결과", () => {
  it("중첩 select 별칭만 복원하고 평평한 별칭과 JSON 값은 보존한다", async () => {
    const selected = query().select({
      user: { id: "users.id", data: "users.payload" },
      literal__name: "users.name",
      payload: "users.payload",
    });
    const payload = [{ arbitrary__key: "원본" }];
    result(selected.rawQuery(), [
      { user__id: 1, user__data: payload, literal__name: "이름", payload },
    ]);
    const rows = await selected;
    expect(rows).toEqual([{ user: { id: 1, data: payload }, literal__name: "이름", payload }]);
    expect(rows[0]?.user.data).toBe(payload);
  });

  it("중첩 select의 빈 JSON 배열을 관계 없음으로 바꾸지 않는다", async () => {
    const selected = query().select({ user: { data: "users.payload" } });
    result(selected.rawQuery(), [{ user__data: [] }]);
    expect(await selected).toEqual([{ user: { data: [] } }]);
  });

  it("중첩 단계마다 id로 null 관계를 복원한다", async () => {
    const selected = query()
      .leftJoin({ user: "users" }, (join) => join.on("users.id", "user.id"))
      .leftJoin({ user__detail: "users" }, (join) => join.on("users.id", "user__detail.id"))
      .select({
        user: { id: "user.id", detail: { id: "user__detail.id", name: "user__detail.name" } },
      });
    result(selected.rawQuery(), [
      { user__id: 1, user__detail__id: null, user__detail__name: null },
      { user__id: null, user__detail__id: 2, user__detail__name: "무시할 값" },
    ]);
    expect(await selected).toEqual([{ user: { id: 1, detail: null } }, { user: null }]);
  });

  it("nullable 필드만 선택한 일반 그룹은 null로 축약하지 않는다", async () => {
    const selected = query().select({ profile: { nickname: "users.nickname" } });
    result(selected.rawQuery(), [{ profile__nickname: null }]);
    expect(await selected).toEqual([{ profile: { nickname: null } }]);
  });

  const leftJoined = () =>
    query().leftJoin({ colleague: "users" }, (join) => join.on("users.id", "colleague.id"));
  it.each([
    [
      "LEFT JOIN 별칭과 같은 그룹",
      () => leftJoined().select({ colleague: { nickname: "colleague.nickname" } }),
    ],
    [
      "LEFT JOIN 별칭을 다른 이름으로 묶은 그룹",
      () => leftJoined().select({ profile: { nickname: "colleague.nickname" } }),
    ],
    [
      "칸 없이 하위 그룹만 가진 LEFT JOIN 그룹",
      () => leftJoined().select({ colleague: { detail: { name: "users.name" } } }),
    ],
  ])("%s에 id가 없으면 실행할 때 오류를 낸다", async (_, build) => {
    const selected = build();
    result(selected.rawQuery(), []);
    await expect(selected).rejects.toThrow(
      /needs an "id" field because it reads LEFT JOIN "colleague"/,
    );
    // rawQuery와 toQuery는 검사하지 않습니다.
    expect(selected.toQuery()).toContain("left join");
    expect(await selected.rawQuery()).toEqual([]);
  });

  it("INNER JOIN 별칭과 같은 그룹도 nullable 필드를 보존한다", async () => {
    const selected = query()
      .join({ colleague: "users" }, "users.id", "colleague.id")
      .select({ colleague: { nickname: "colleague.nickname" } });
    result(selected.rawQuery(), [{ colleague__nickname: null }]);
    expect(await selected).toEqual([{ colleague: { nickname: null } }]);
  });

  it("선택한 값이 모두 null이어도 LEFT JOIN 행의 id가 있으면 객체를 유지한다", async () => {
    const selected = query()
      .leftJoin({ colleague: "users" }, (join) => join.on("users.id", "colleague.id"))
      .select({ colleague: { id: "colleague.id", nickname: "colleague.nickname" } });
    const rows = [
      { colleague__id: 1, colleague__nickname: null },
      { colleague__id: null, colleague__nickname: null },
    ];
    result(selected.rawQuery(), rows);
    expect(await selected).toEqual([{ colleague: { id: 1, nickname: null } }, { colleague: null }]);
    expect(await selected.rawQuery()).toEqual(rows);
  });

  it("GROUP BY에 id를 넣은 LEFT JOIN 그룹도 id로 판정한다", async () => {
    const selected = query()
      .leftJoin({ colleague: "users" }, (join) => join.on("users.id", "colleague.id"))
      .select({ colleague: { id: "colleague.id", nickname: "colleague.nickname" } })
      .groupBy("colleague.id", "colleague.nickname");
    result(selected.rawQuery(), [
      { colleague__id: 1, colleague__nickname: null },
      { colleague__id: null, colleague__nickname: null },
    ]);
    expect(await selected).toEqual([{ colleague: { id: 1, nickname: null } }, { colleague: null }]);
  });

  it("여러 별칭이 섞인 그룹은 id 하나로 통과하고 그 id로만 판정한다", async () => {
    const selected = query()
      .join({ staffs: "users" }, "users.id", "staffs.id")
      .leftJoin({ colleague: "users" }, (join) => join.on("users.id", "colleague.id"))
      .select({ manager: { id: "staffs.id", name: "colleague.name" } });
    result(selected.rawQuery(), [{ manager__id: 1, manager__name: null }]);
    expect(await selected).toEqual([{ manager: { id: 1, name: null } }]);
  });

  it("raw 식만 든 그룹은 LEFT JOIN 별칭과 같아도 검사하지 않고 객체로 둔다", async () => {
    const selected = query()
      .leftJoin({ colleague: "users" }, (join) => join.on("users.id", "colleague.id"))
      .select({ colleague: { total: Puri.rawNumber("COUNT(colleague.id)") } });
    result(selected.rawQuery(), [{ colleague__total: null }]);
    expect(await selected).toEqual([{ colleague: { total: null } }]);
  });

  it("서브쿼리를 LEFT JOIN한 그룹도 id가 없으면 오류를 내고 id가 있으면 id로 판정한다", async () => {
    const sub = query().select({ id: "users.id", name: "users.name" });
    const missing = query()
      .leftJoin({ sq: sub }, "users.id", "sq.id")
      .select({ sq: { name: "sq.name" } });
    result(missing.rawQuery(), []);
    await expect(missing).rejects.toThrow(/needs an "id" field because it reads LEFT JOIN "sq"/);
    const selected = query()
      .leftJoin({ sq: sub }, "users.id", "sq.id")
      .select({ sq: { id: "sq.id", name: "sq.name" } });
    result(selected.rawQuery(), [
      { sq__id: 1, sq__name: null },
      { sq__id: null, sq__name: null },
    ]);
    expect(await selected).toEqual([{ sq: { id: 1, name: null } }, { sq: null }]);
    const flat = query().leftJoin({ sq: sub }, "users.id", "sq.id").select({ sq__name: "sq.name" });
    result(flat.rawQuery(), [{ sq__name: null }]);
    expect(await flat).toEqual([{ sq__name: null }]);
  });

  it("Puri가 모르게 joinRaw로 붙인 별칭은 id가 있으면 id로 판정한다", async () => {
    // medpath의 마지막 메시지처럼 rawQuery().joinRaw("LEFT JOIN LATERAL …")로 붙인 별칭입니다.
    const selected = query().select({
      // @ts-expect-error joinRaw로 붙인 별칭은 Puri 타입이 모릅니다.
      last_message: { id: "last_message.id", body: "last_message.body" },
    });
    selected
      .rawQuery()
      .joinRaw("LEFT JOIN LATERAL (SELECT 1 AS id, '' AS body) AS last_message ON TRUE");
    result(selected.rawQuery(), [
      { last_message__id: 1, last_message__body: null },
      { last_message__id: null, last_message__body: null },
    ]);
    expect(await selected).toEqual([
      { last_message: { id: 1, body: null } },
      { last_message: null },
    ]);
  });

  it.each([false, true])(
    "다른 이름의 관계 그룹도 id 원본 LEFT JOIN을 따른다 (원시 표현식: %s)",
    async (raw) => {
      const selected = query()
        .leftJoin({ staffs: "users" }, (join) => join.on("users.id", "staffs.id"))
        .select({ manager: { id: "staffs.id", name: "staffs.name" } });
      if (raw) selected.appendSelect({ total: Puri.rawNumber("(SELECT COUNT(*) FROM users)") });
      const cloned = selected.clone();
      result(cloned.rawQuery(), [
        { manager__id: 1, manager__name: "담당자" },
        { manager__id: null, manager__name: null },
      ]);
      expect(await cloned).toEqual([{ manager: { id: 1, name: "담당자" } }, { manager: null }]);
    },
  );

  it("관계 id 선택을 clear한 뒤 일반 nullable id 그룹을 선택하면 관계 의미도 지운다", async () => {
    const selected = query()
      .leftJoin({ staffs: "users" }, (join) => join.on("users.id", "staffs.id"))
      .select({ manager: { id: "staffs.id" } })
      .clear("select")
      .select({ manager: { id: "users.nickname" } });
    result(selected.rawQuery(), [{ manager__id: null }]);
    expect(await selected).toEqual([{ manager: { id: null } }]);
  });

  it("객체 키 안의 구분자는 중첩 경로로 다시 해석하지 않는다", async () => {
    const selected = query().select({ user__profile: { display__name: "users.name" } });
    result(selected.rawQuery(), [{ user__profile__display__name: "이름" }]);
    expect(await selected).toEqual([{ user__profile: { display__name: "이름" } }]);
  });

  it.each(["then", "catch", "finally"] as const)(
    "%s 실행에서도 중첩 결과를 반환한다",
    async (method) => {
      const selected = query().select({ user: { id: "users.id" } });
      result(selected.rawQuery(), [{ user__id: 1 }]);
      const rows =
        method === "then"
          ? await selected.then()
          : method === "catch"
            ? await selected.catch()
            : await selected.finally();
      expect(rows).toEqual([{ user: { id: 1 } }]);
    },
  );

  it.each(["then", "catch", "finally"] as const)(
    "first의 %s 실행과 조회 결과 없음도 처리한다",
    async (method) => {
      const selected = query()
        .select({ user: { id: "users.id" } })
        .first();
      result(selected.knexQuery, { user__id: 1 });
      const row =
        method === "then"
          ? await selected.then()
          : method === "catch"
            ? await selected.catch()
            : await selected.finally();
      expect(row).toEqual({ user: { id: 1 } });
      result(selected.knexQuery, undefined);
      expect(await selected).toBeUndefined();
    },
  );

  it.each(["select", "columns"] as const)(
    "clone과 appendSelect는 중첩 경로를 보존하고 clear(%s)는 복제본에만 적용된다",
    async (statement) => {
      const original = query().select({ user: { id: "users.id" } });
      const cloned = original.clone().appendSelect({ detail: { name: "users.name" } });
      result(cloned.rawQuery(), [{ user__id: 1, detail__name: "이름" }]);
      expect(await cloned).toEqual([{ user: { id: 1 }, detail: { name: "이름" } }]);
      cloned.clear(statement).select({ user__id: "users.id" });
      result(cloned.rawQuery(), [{ user__id: 2 }]);
      expect(await cloned).toEqual([{ user__id: 2 }]);
      result(original.rawQuery(), [{ user__id: 1 }]);
      expect(await original).toEqual([{ user: { id: 1 } }]);
    },
  );

  it("rawQuery는 기존의 평평한 SQL 결과를 그대로 반환한다", async () => {
    const selected = query().select({ user: { id: "users.id" } });
    result(selected.rawQuery(), [{ user__id: 1 }]);
    expect(await selected.rawQuery()).toEqual([{ user__id: 1 }]);
  });
});
