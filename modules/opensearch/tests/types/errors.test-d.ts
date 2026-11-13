import { expectTypeOf, test } from "vitest";

import {
  type SearchError,
  type SearchErrorCode,
  SearchInvalidDocumentId,
  SearchTimeout,
} from "../../src";

test("오류 클래스의 code는 리터럴 타입이고 SearchError의 code는 전체 코드 유니온이다", () => {
  expectTypeOf(new SearchTimeout().code).toEqualTypeOf<"SEARCH_TIMEOUT">();
  expectTypeOf(
    new SearchInvalidDocumentId({ key: "documentId.empty" }).code,
  ).toEqualTypeOf<"SEARCH_INVALID_DOCUMENT_ID">();
  expectTypeOf<SearchError["code"]>().toEqualTypeOf<SearchErrorCode>();
  expectTypeOf<SearchTimeout>().toExtend<SearchError>();
  expectTypeOf<SearchError["retryable"]>().toEqualTypeOf<boolean>();
});
