import { describe, expectTypeOf, it } from "vitest";
import type { Hydrate } from "./puri-subset.types";

describe("Hydrate", () => {
  it("flat 객체를 그대로 유지한다 (__ 없는 경우)", () => {
    type Input = { id: number; name: string };
    type Result = Hydrate<Input>;

    const result = {} as Result;
    expectTypeOf(result).branded.toEqualTypeOf<Hydrate<Input>>();
  });

  it("단일 depth의 __ 키를 중첩 객체로 변환한다", () => {
    type Input = { id: number; user__name: string; user__email: string };
    type Result = Hydrate<Input>;

    const result = {} as Result;
    expectTypeOf(result).branded.toEqualTypeOf<{
      id: number;
      user: { name: string; email: string };
    }>();
  });

  it("다중 depth의 __ 키를 재귀적으로 중첩 객체로 변환한다", () => {
    type Input = {
      id: number;
      user__profile__bio: string;
      user__profile__avatar: string;
      user__name: string;
    };
    type Result = Hydrate<Input>;

    const result = {} as Result;
    expectTypeOf(result).branded.toEqualTypeOf<{
      id: number;
      user: {
        name: string;
        profile: { bio: string; avatar: string };
      };
    }>();
  });

  it("여러 관계를 동시에 처리한다", () => {
    type Input = {
      id: number;
      user__id: number;
      user__name: string;
      post__id: number;
      post__title: string;
    };
    type Result = Hydrate<Input>;

    const result = {} as Result;
    expectTypeOf(result).branded.toEqualTypeOf<{
      id: number;
      user: { id: number; name: string };
      post: { id: number; title: string };
    }>();
  });

  it("빈 객체를 처리한다", () => {
    type Input = {};
    type Result = Hydrate<Input>;

    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{}>();
  });
});
