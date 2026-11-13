import { describe, expect, it } from "vitest";

import * as root from "../../src";
import {
  SEARCH_ERROR_CODES,
  SearchCatalogUnavailable,
  SearchError,
  SearchProjectionError,
  SearchTimeout,
} from "../../src/errors";
import { CLASS_BY_CODE } from "./error-classes";
describe("오류 목록", () => {
  it("모든 코드에 정확히 하나의 오류 클래스가 있고 코드가 일치한다", () => {
    expect(Object.keys(CLASS_BY_CODE).toSorted()).toEqual([...SEARCH_ERROR_CODES].toSorted());
    expect(new Set(Object.values(CLASS_BY_CODE)).size).toBe(SEARCH_ERROR_CODES.length);
    for (const [code, ErrorClass] of Object.entries(CLASS_BY_CODE)) {
      const instance = new ErrorClass();
      expect(instance).toBeInstanceOf(SearchError);
      expect(instance).toBeInstanceOf(Error);
      expect(instance.code).toBe(code);
      expect(instance.name).toBe(ErrorClass.name);
      expect(instance.messageKey).toMatch(/^error\./);
      expect(instance.messageParams).toBeUndefined();
    }
  });

  it("루트 진입점은 모든 오류 클래스를 내보내고 그 밖의 SearchError 하위 클래스는 없다", () => {
    const exportedNames = Object.entries(root)
      .filter(([, value]) => Object.prototype.isPrototypeOf.call(SearchError, value))
      .map(([name]) => name);
    expect(exportedNames.toSorted()).toEqual(
      Object.values(CLASS_BY_CODE)
        .map((ErrorClass) => ErrorClass.name)
        .toSorted(),
    );
    for (const ErrorClass of Object.values(CLASS_BY_CODE)) {
      expect(Object.values(root)).toContain(ErrorClass);
    }
    expect(root.SearchError).toBe(SearchError);
    expect(root.SEARCH_ERROR_CODES).toBe(SEARCH_ERROR_CODES);
  });

  it("retryable 기본값은 클래스가 정하고 옵션으로 덮어쓸 수 있다", () => {
    const retryable = Object.entries(CLASS_BY_CODE)
      .filter(([, ErrorClass]) => new ErrorClass().retryable)
      .map(([code]) => code)
      .toSorted();
    expect(retryable).toEqual(
      [
        "SEARCH_ADMIN_BUSY",
        "SEARCH_ADMIN_LEASE_LOST",
        "SEARCH_CATALOG_UNAVAILABLE",
        "SEARCH_NOT_READY",
        "SEARCH_TIMEOUT",
        "SEARCH_UNAVAILABLE",
      ].toSorted(),
    );
    expect(new SearchTimeout(undefined, { retryable: false }).retryable).toBe(false);
    expect(new SearchProjectionError(undefined, { retryable: true }).retryable).toBe(true);
  });

  it("cause, details, 메시지 매개변수를 보존하고 고정된 복사본으로 담는다", () => {
    const cause = new Error("원인");
    const details = { status: 503, index: "snm-a-b" };
    const params = { bytes: 600, maxBytes: 512 };
    const error = new SearchCatalogUnavailable(
      { key: "documentId.tooLong", params },
      { cause, details },
    );
    details.status = 200;
    params.bytes = 1;
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual({ status: 503, index: "snm-a-b" });
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(error.messageKey).toBe("documentId.tooLong");
    expect(error.messageParams).toEqual({ bytes: 600, maxBytes: 512 });
    expect(Object.isFrozen(error.messageParams)).toBe(true);
    expect(new SearchTimeout().cause).toBeUndefined();
    expect(new SearchTimeout().details).toBeUndefined();
  });
});
