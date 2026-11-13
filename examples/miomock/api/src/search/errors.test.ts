import {
  SearchCatalogUnavailable,
  SearchCursorExpired,
  type SearchError,
  SearchInTransactionError,
  SearchNotConfigured,
  SearchNotReady,
  SearchQueryInvalid,
  SearchRebuildRequired,
  SearchUnavailable,
} from "@sonamu-kit/opensearch";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { SEARCH_HTTP_STATUS, toSearchErrorResponse } from "./errors";

bootstrap(vi);

// The search screen branches on these statuses because the generated client drops the response code.
describe("검색 오류의 HTTP 상태", () => {
  const cases: { label: string; error: SearchError; status: number }[] = [
    {
      label: "잘못된 검색어",
      error: new SearchQueryInvalid(),
      status: SEARCH_HTTP_STATUS.invalidQuery,
    },
    {
      label: "만료된 커서",
      error: new SearchCursorExpired(),
      status: SEARCH_HTTP_STATUS.cursorExpired,
    },
    { label: "첫 cutover 전", error: new SearchNotReady(), status: SEARCH_HTTP_STATUS.notReady },
    {
      label: "등록되지 않은 인덱스",
      error: new SearchNotConfigured(),
      status: SEARCH_HTTP_STATUS.notReady,
    },
    {
      label: "재구축 필요",
      error: new SearchRebuildRequired(),
      status: SEARCH_HTTP_STATUS.notReady,
    },
    { label: "엔진 장애", error: new SearchUnavailable(), status: SEARCH_HTTP_STATUS.unavailable },
    {
      label: "카탈로그 장애",
      error: new SearchCatalogUnavailable(),
      status: SEARCH_HTTP_STATUS.unavailable,
    },
    {
      label: "트랜잭션 안의 검색",
      error: new SearchInTransactionError(),
      status: SEARCH_HTTP_STATUS.internal,
    },
  ];

  test("오류 클래스마다 정해진 상태 코드와 사람용 메시지를 돌려준다", () => {
    for (const { label, error, status } of cases) {
      const response = toSearchErrorResponse(error, "en");
      expect(response.status, label).toBe(status);
      expect(response.body.code, label).toBe(error.code);
      expect(response.body.message, label).not.toBe(error.code);
      expect(response.body.message.length, label).toBeGreaterThan(0);
    }
  });
});
