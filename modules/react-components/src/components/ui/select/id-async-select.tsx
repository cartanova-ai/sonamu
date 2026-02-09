/** biome-ignore-all lint/suspicious/noExplicitAny: AsyncIdConfig의 useList params는 contravariance 때문에 any 필요 (unknown 사용시 구체적 타입 전달 불가) */

import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useSonamuBaseContext } from "@/contexts";
import { Select } from "./select";

// ============================================================================
// Type Definition
// ============================================================================

// AsyncIdConfig 타입
// services.generated.ts에서 생성되는 config와 호환됨
// _TSubsetMapping은 onRowChange의 타입 추론에 사용됨
// _TListParams는 baseListParams의 타입 추론에 사용됨
export type AsyncIdConfig<
  TSubsetKey extends string = string,
  _TSubsetMapping = Record<string, unknown>,
  _TListParams extends Record<string, unknown> = Record<string, unknown>,
> = {
  placeholderKey: string;
  useList: <T extends TSubsetKey>(
    subset: T,
    params?: any,
    options?: { enabled?: boolean },
  ) => UseQueryResult<Record<string, unknown>, Error>;
};

// SubsetMapping에서 선택된 subset의 필드 키를 추출하는 유틸리티 타입
type SubsetFieldKeys<
  TSubsetKey extends string,
  TSubsetMapping,
> = TSubsetKey extends keyof TSubsetMapping
  ? TSubsetMapping[TSubsetKey] extends Record<string, unknown>
    ? string & keyof TSubsetMapping[TSubsetKey]
    : string
  : string;

// SubsetMapping에서 선택된 subset의 row 타입을 추출하는 유틸리티 타입
type SubsetRow<TSubsetKey extends string, TSubsetMapping> = TSubsetKey extends keyof TSubsetMapping
  ? TSubsetMapping[TSubsetKey]
  : Record<string, unknown>;

// displayField: 필드명 또는 row 콜백 함수
type DisplayFieldAsString<TSubsetKey extends string, TSubsetMapping> = {
  displayField?: SubsetFieldKeys<TSubsetKey, TSubsetMapping>;
};
type DisplayFieldAsCallback<TSubsetKey extends string, TSubsetMapping> = {
  displayField: (row: SubsetRow<TSubsetKey, TSubsetMapping>) => string;
};

// onRowChange의 row 파라미터 타입
type OnRowChangeType<
  TSubsetKey extends string,
  TSubsetMapping,
> = TSubsetKey extends keyof TSubsetMapping
  ? TSubsetMapping[TSubsetKey] | TSubsetMapping[TSubsetKey][] | undefined
  : unknown;

// IdAsyncSelect 공통 Props (displayField 제외)
type IdAsyncSelectBaseProps<
  TSubsetKey extends string = string,
  TSubsetMapping = Record<string, unknown>,
  TValue extends string | number = string,
  TListParams extends Record<string, unknown> = Record<string, unknown>,
  TSubset extends TSubsetKey = TSubsetKey,
> = {
  // Entity Async ID Config
  config: AsyncIdConfig<TSubsetKey, TSubsetMapping, TListParams>;
  // Entity subset key
  subset: TSubset;
  // 검색/조회 시 적용될 파라미터
  baseListParams?: Partial<Omit<TListParams, "keyword" | "page">>;
  // 실제 저장/전송될 값의 필드명 (기본값: "id")
  valueField?: SubsetFieldKeys<TSubset, TSubsetMapping>;
  // 기본 Select Props
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  // Single/Multi 모드
  multiple?: boolean;
  value?: TValue | TValue[] | null;
  onValueChange?: (value: TValue | TValue[] | undefined) => void;
  onRowChange?: (row: OnRowChangeType<TSubset, TSubsetMapping>) => void;
};

// IdAsyncSelect Total Props
export type IdAsyncSelectProps<
  TSubsetKey extends string = string,
  TSubsetMapping = Record<string, unknown>,
  TValue extends string | number = string,
  TListParams extends Record<string, unknown> = Record<string, unknown>,
  TSubset extends TSubsetKey = TSubsetKey,
> = IdAsyncSelectBaseProps<TSubsetKey, TSubsetMapping, TValue, TListParams, TSubset> &
  (DisplayFieldAsString<TSubset, TSubsetMapping> | DisplayFieldAsCallback<TSubset, TSubsetMapping>);

// ============================================================================
// Component
// ============================================================================

// name-like 컨럼을 찾기 위한 후보 필드명 (우선순위 순)
const NAME_LIKE_FIELDS = ["name", "title", "label", "display_name", "username"];

/**
 * row 데이터에서 name-like 필드를 자동 탐지
 */
function detectDisplayField(row: Record<string, unknown>): string {
  // 1) name-like 필드 찾기
  for (const field of NAME_LIKE_FIELDS) {
    if (field in row && row[field] != null) {
      return field;
    }
  }
  // 2) string 타입인 첫 번째 컨럼 (id 제외)
  for (const [key, val] of Object.entries(row)) {
    if (key !== "id" && typeof val === "string") {
      return key;
    }
  }
  // 3) fallback
  return "id";
}

export function IdAsyncSelect<
  TSubsetKey extends string = string,
  TSubsetMapping = Record<string, unknown>,
  TValue extends string | number = string,
  TListParams extends Record<string, unknown> = Record<string, unknown>,
  TSubset extends TSubsetKey = TSubsetKey,
>({
  config,
  subset,
  baseListParams,
  displayField,
  valueField = "id" as SubsetFieldKeys<TSubset, TSubsetMapping>,
  placeholder,
  clearable,
  disabled,
  className,
  multiple = false,
  value,
  onValueChange,
  onRowChange,
}: IdAsyncSelectProps<TSubsetKey, TSubsetMapping, TValue, TListParams, TSubset>) {
  const { SD } = useSonamuBaseContext();

  // onRowChange의 파라미터 타입
  type RowChangeParam = Parameters<NonNullable<typeof onRowChange>>[0];

  // ============================================================
  // displayField 해석: 콜백 / 필드명 / 자동탐지 분리
  // ============================================================
  const isDisplayFieldCallback = typeof displayField === "function";

  // row에서 label을 추출하는 함수
  const getLabel = useCallback(
    (row: Record<string, unknown>): string => {
      if (isDisplayFieldCallback) {
        return (displayField as (row: any) => string)(row);
      }
      const field = typeof displayField === "string" ? displayField : detectDisplayField(row);
      return String(row[field] ?? "");
    },
    [displayField, isDisplayFieldCallback],
  );

  // ============================================================
  // listParams 상태 관리
  // ============================================================
  const [listParams, setListParams] = useState<Record<string, unknown>>(baseListParams ?? {});

  // ============================================================
  // handleSearch 로직
  // ============================================================
  const handleSearch = useCallback((keyword: string) => {
    setListParams((prev) => ({
      ...prev,
      keyword: keyword || undefined,
    }));
  }, []);

  // ============================================================
  // 리스트 로드
  // ============================================================
  const isNotEmpty = (val: unknown) => val != null && val !== "" && val !== 0;
  const keyword = listParams?.keyword;
  const shouldLoadList =
    (typeof keyword === "string" && keyword.length > 0) ||
    (multiple && Array.isArray(value) && value.length > 0);

  const {
    data,
    isLoading: listLoading,
    error,
  } = config.useList(subset, listParams, {
    enabled: shouldLoadList,
  });

  const rows = (data?.rows ?? []) as Record<string, unknown>[];

  // ============================================================
  // Single 모드: 선택된 값 로드
  // ============================================================
  const singleValue = !multiple && isNotEmpty(value) ? (value as TValue) : null;

  // 먼저 현재 rows에서 찾기
  const selectedInRows = useMemo(
    () => rows.find((row) => row[valueField] === singleValue),
    [rows, singleValue, valueField],
  );

  // rows에 없으면 id로 조회 (검색 중에도 selectedRow 유지 위해)
  const shouldLoadById = singleValue != null && !selectedInRows;
  const selectedQuery = config.useList(
    subset,
    { id: singleValue, num: 1, page: 1 },
    { enabled: shouldLoadById },
  );

  // selectedQuery로 로드한 데이터가 있으면 우선 사용, 없으면 현재 rows에서 찾기
  const selectedRow = ((selectedQuery.data?.rows as Record<string, unknown>[] | undefined)?.[0] ||
    selectedInRows) as Record<string, unknown> | undefined;

  // ============================================================
  // Multi 모드: 선택된 값들 로드
  // ============================================================
  const multiValues = multiple && Array.isArray(value) ? (value as TValue[]) : [];

  // 먼저 현재 rows에서 찾기
  const selectedMultiInRows = useMemo(
    () => multiValues.map((val) => rows.find((row) => row[valueField] === val)).filter(Boolean),
    [rows, multiValues, valueField],
  );

  // rows에 없는 항목들을 id로 조회
  const selectedMultiIds = useMemo(() => {
    const foundIds = new Set(selectedMultiInRows.map((row) => row?.[valueField]));
    return multiValues.filter((val) => !foundIds.has(val));
  }, [multiValues, selectedMultiInRows, valueField]);

  const shouldLoadByIds = selectedMultiIds.length > 0;
  const multiSelectedQuery = config.useList(
    subset,
    { id: selectedMultiIds, num: selectedMultiIds.length, page: 1 },
    { enabled: shouldLoadByIds },
  );

  // 최종 선택된 rows (rows에서 찾은 것 + query로 로드한 것)
  const multiSelectedRows = useMemo(() => {
    const queryRows = (multiSelectedQuery.data?.rows ?? []) as Record<string, unknown>[];
    return [...selectedMultiInRows, ...queryRows] as Record<string, unknown>[];
  }, [selectedMultiInRows, multiSelectedQuery.data]);

  const isLoading =
    listLoading ||
    (shouldLoadById && selectedQuery.isLoading) ||
    (shouldLoadByIds && multiSelectedQuery.isLoading);

  // ============================================================
  // itemMap + rowMap
  // ============================================================
  const { items, rowMap } = useMemo(() => {
    const rowMap = new Map<TValue, Record<string, unknown>>();
    const itemMap = new Map<TValue, { value: TValue; label: string }>();

    // Single 모드: 선택된 항목 추가
    if (!multiple && selectedRow && singleValue != null) {
      rowMap.set(singleValue, selectedRow);
      itemMap.set(singleValue, {
        value: singleValue,
        label: getLabel(selectedRow),
      });
    }

    // Multi 모드: 선택된 항목들 추가
    if (multiple && multiSelectedRows.length > 0) {
      for (const row of multiSelectedRows) {
        const val = row[valueField] as TValue;
        rowMap.set(val, row);
        itemMap.set(val, {
          value: val,
          label: getLabel(row),
        });
      }
    }

    // 검색 결과 추가
    for (const row of rows) {
      const val = row[valueField] as TValue;
      rowMap.set(val, row);
      itemMap.set(val, {
        value: val,
        label: getLabel(row),
      });
    }

    return {
      items: Array.from(itemMap.values()),
      rowMap,
    };
  }, [rows, selectedRow, singleValue, multiSelectedRows, multiple, getLabel, valueField]);

  // ============================================================
  // Select 렌더링
  // ============================================================
  if (!multiple) {
    return (
      <Select
        items={items}
        value={value as TValue | undefined}
        onValueChange={(newValue: TValue | undefined) => {
          onValueChange?.(newValue);
          onRowChange?.((newValue ? rowMap.get(newValue) : undefined) as RowChangeParam);
        }}
        placeholder={placeholder ?? SD(config.placeholderKey)}
        clearable={clearable}
        disabled={disabled}
        className={className}
        multiple={false}
        async={true}
        loading={isLoading}
        error={error ?? undefined}
        onSearch={handleSearch}
      />
    );
  }

  return (
    <Select
      items={items}
      value={(value as TValue[]) ?? []}
      onValueChange={(newValue: TValue[]) => {
        onValueChange?.(newValue);
        onRowChange?.(newValue.map((val) => rowMap.get(val)).filter(Boolean) as RowChangeParam);
      }}
      placeholder={placeholder ?? SD(config.placeholderKey)}
      clearable={clearable}
      disabled={disabled}
      className={className}
      multiple={true}
      async={true}
      loading={isLoading}
      error={error ?? undefined}
      onSearch={handleSearch}
    />
  );
}
