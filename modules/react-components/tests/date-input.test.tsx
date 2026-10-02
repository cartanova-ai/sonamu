import { afterEach, describe, expect, it, vi } from "vitest";

import { DateInput } from "../src/components/ui/date-input";

// oxlint-disable-next-line anti-slop/no-module-mocking -- DateInput 본체만 격리해 앱 Vite 플러그인의 패키지 자동 설치를 막습니다.
vi.mock("../src/components/ui/input", () => ({
  Input: () => null,
}));

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

function renderDateInput(value: Date | string | null) {
  const changedValues: Array<Date | null> = [];
  const element = DateInput({
    // SAFETY: 공개 타입 밖의 문자열 입력은 기존 런타임 호환성을 검증할 유효한 ISO 문자열로만 제한합니다.
    value: value as Date | null,
    onValueChange: (changedValue) => changedValues.push(changedValue),
  });

  return { element, changedValues };
}

function changeValue(element: ReturnType<typeof DateInput>, value: string) {
  element.props.onChange({ target: { value } });
}

describe.each([
  {
    caseName: "서울 표준시",
    timezone: "Asia/Seoul",
    isoValue: "2026-03-15T00:30:00.000Z",
    displayedValue: "2026-03-15T09:30",
  },
  {
    caseName: "UTC",
    timezone: "UTC",
    isoValue: "2026-03-15T00:30:00.000Z",
    displayedValue: "2026-03-15T00:30",
  },
  {
    caseName: "뉴욕 서머타임",
    timezone: "America/New_York",
    isoValue: "2026-03-15T00:30:00.000Z",
    displayedValue: "2026-03-14T20:30",
  },
  {
    caseName: "서울 자정 날짜 경계",
    timezone: "Asia/Seoul",
    isoValue: "2026-03-14T15:00:00.000Z",
    displayedValue: "2026-03-15T00:00",
  },
  {
    caseName: "뉴욕 겨울 자정",
    timezone: "America/New_York",
    isoValue: "2026-01-15T05:00:00.000Z",
    displayedValue: "2026-01-15T00:00",
  },
])("$caseName", ({ timezone, isoValue, displayedValue }) => {
  it("Date와 런타임 ISO 문자열을 현지 시각으로 표시하고 모호하지 않은 시각의 재입력 시점을 보존한다", () => {
    process.env.TZ = timezone;

    const dateResult = renderDateInput(new Date(isoValue));
    const stringResult = renderDateInput(isoValue);

    expect(dateResult.element.props.value).toBe(displayedValue);
    expect(stringResult.element.props.value).toBe(displayedValue);

    changeValue(dateResult.element, dateResult.element.props.value);

    expect(dateResult.changedValues).toHaveLength(1);
    expect(dateResult.changedValues[0]).toBeInstanceOf(Date);
    expect(dateResult.changedValues[0]?.getTime()).toBe(new Date(isoValue).getTime());
  });
});

describe("DateInput 입력 계약", () => {
  it("null은 빈 값으로 표시하고 입력을 지우면 null을 전달한다", () => {
    const { element, changedValues } = renderDateInput(null);

    expect(element.props.value).toBe("");

    changeValue(element, "");

    expect(changedValues).toEqual([null]);
  });

  it("datetime-local 타입과 나머지 input 속성을 유지한다", () => {
    const element = DateInput({
      value: null,
      onValueChange: () => undefined,
      name: "startedAt",
      disabled: true,
      "aria-label": "시작 시각",
    });

    expect(element.props).toMatchObject({
      type: "datetime-local",
      value: "",
      name: "startedAt",
      disabled: true,
      "aria-label": "시작 시각",
    });
  });
});
