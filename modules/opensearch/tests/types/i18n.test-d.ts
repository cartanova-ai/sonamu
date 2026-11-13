import { expectTypeOf, test } from "vitest";

import {
  type PartialSearchMessageCatalog,
  registerSearchMessages,
  type SearchMessage,
  type SearchMessageCatalog,
  type SearchMessageKey,
  type SearchMessageParams,
  type SearchMessageParamValue,
  SearchTimeout,
} from "../../src";
import { searchMessagesEn } from "../../src/i18n/en";
import { searchMessagesKo } from "../../src/i18n/ko";

type ParamsAreIdentifiers = {
  [K in SearchMessageKey]: SearchMessageParams<K> extends
    | undefined
    | Readonly<Record<string, SearchMessageParamValue>>
    ? true
    : K;
}[SearchMessageKey];

test("ko 카탈로그는 en과 같은 키와 매개변수 형태를 갖는다", () => {
  expectTypeOf(searchMessagesKo).toEqualTypeOf<SearchMessageCatalog>();
  expectTypeOf(searchMessagesEn).toExtend<SearchMessageCatalog>();
  expectTypeOf<keyof typeof searchMessagesKo>().toEqualTypeOf<keyof typeof searchMessagesEn>();
  expectTypeOf<SearchMessageCatalog["documentId.tooLong"]>().toEqualTypeOf<
    (params: { bytes: number; maxBytes: number }) => string
  >();
  expectTypeOf<SearchMessageCatalog["error.timeout"]>().toEqualTypeOf<string>();
});

test("메시지 매개변수는 식별자와 수치만 담는다", () => {
  expectTypeOf<ParamsAreIdentifiers>().toEqualTypeOf<true>();
});

test("SearchMessage는 키와 매개변수의 짝을 강제한다", () => {
  expectTypeOf<{ key: "error.timeout" }>().toExtend<SearchMessage>();
  expectTypeOf<{
    key: "documentId.tooLong";
    params: { bytes: 1; maxBytes: 2 };
  }>().toExtend<SearchMessage>();
  // @ts-expect-error -- this key needs params
  const missing: SearchMessage = { key: "documentId.tooLong" };
  // @ts-expect-error -- params of another key
  const wrong: SearchMessage = { key: "documentId.tooLong", params: { name: "x" } };
  // @ts-expect-error -- unknown key
  const unknown: SearchMessage = { key: "error.nope" };
  expectTypeOf([missing, wrong, unknown]).toExtend<SearchMessage[]>();
  // @ts-expect-error -- errors take no free-text message
  expectTypeOf(new SearchTimeout("free text")).toExtend<SearchTimeout>();
});

test("등록 카탈로그는 일부 키만 가질 수 있고 매개변수 타입이 추론된다", () => {
  const partial: PartialSearchMessageCatalog = {
    "error.timeout": "Délai dépassé.",
    "names.invalidNamespace": (params) => {
      expectTypeOf(params).toEqualTypeOf<{ name: string }>();
      return params.name;
    },
  };
  expectTypeOf(registerSearchMessages).parameter(1).toEqualTypeOf<PartialSearchMessageCatalog>();
  expectTypeOf(partial).toExtend<PartialSearchMessageCatalog>();
  // @ts-expect-error -- unknown keys cannot be registered
  const typo: PartialSearchMessageCatalog = { "error.timeot": "x" };
  expectTypeOf(typo).toExtend<PartialSearchMessageCatalog>();
});
