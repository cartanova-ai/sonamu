/* oxlint-disable @typescript-eslint/no-explicit-any */ // AsyncIdConfig의 useList params는 contravariance 때문에 any 필요 (unknown 사용시 구체적 타입 전달 불가)

import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  ) => UseQueryResult<Record<string, unknown>>;
  // 무한스크롤용. sonamu services 생성기가 항상 주입합니다.
  // select로 rows/total이 평탄화되어 내려옵니다.
  useListInfinite: <T extends TSubsetKey>(
    subset: T,
    params?: any,
    options?: { enabled?: boolean },
  ) => UseInfiniteQueryResult<
    InfiniteData<{ rows: Record<string, unknown>[]; total: number }> & {
      rows: Record<string, unknown>[];
      total: number;
    },
    Error
  >;
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
  /** true이면 키워드 없이도 마운트 시 전체 목록을 즉시 로드 (소규모 데이터셋에 적합) */
  preload?: boolean;
  /** true이면 드롭다운 내 클라이언트 사이드 검색 필터를 표시 */
  searchable?: boolean;
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
    if (Object.keys(row).includes(field)) {
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
  preload = false,
  searchable,
  value,
  onValueChange,
  onRowChange,
}: IdAsyncSelectProps<TSubsetKey, TSubsetMapping, TValue, TListParams, TSubset>) {
  const { SD } = useSonamuBaseContext();
  const queryClient = useQueryClient();

  // onRowChange의 파라미터 타입
  type RowChangeParam = Parameters<NonNullable<typeof onRowChange>>[0];

  // displayField 해석: 콜백 / 필드명 / 자동탐지
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

  // keyword 상태 관리 (사용자 입력 검색어만 관리)
  const [keyword, setKeyword] = useState<string | undefined>(undefined);

  // handleSearch는 keyword state만 갱신합니다.
  // 캐시 삭제 오버로딩 금지: backspace로 검색어를 전부 지운 케이스와 드롭다운 닫힘을 구분할 수 없으면
  // multi 모드에서 영구 빈 상태에 빠집니다. 닫힘 신호는 오직 onOpenChange로 받습니다.
  const handleSearch = useCallback((kw: string) => {
    setKeyword(kw || undefined);
  }, []);

  // 유틸
  const isNotEmpty = (val: unknown): boolean => {
    if (val == null || val === "") {
      return false;
    }
    if (typeof val === "number") {
      return val !== 0 && !Number.isNaN(val);
    }
    return true;
  };

  // baseListParams에 search/orderBy/queryMode 외의 의미 있는 필터값이 있는지 확인
  const IGNORED_FILTER_KEYS = new Set(["search", "orderBy", "queryMode", "num", "page", "keyword"]);
  const hasBaseFilter =
    baseListParams != null &&
    Object.entries(baseListParams).some(([k, v]) => !IGNORED_FILTER_KEYS.has(k) && isNotEmpty(v));

  // preload 또는 baseFilter가 있으면 드롭다운 모드로 취급 (비검색 상태에서도 목록 즉시 노출)
  const isDropdown = preload || hasBaseFilter;

  // 리스트 조회는 항상 useListInfinite 단일 경로
  // baseListParams(외부 필터) + keyword(사용자 검색어) 병합
  const queryParams = {
    ...baseListParams,
    ...(keyword ? { keyword } : {}),
  };

  const infiniteEnabled =
    isDropdown ||
    (typeof keyword === "string" && keyword.length > 0) ||
    (multiple && Array.isArray(value) && value.length > 0);

  const infiniteQuery = config.useListInfinite(subset, queryParams, {
    enabled: infiniteEnabled,
  });

  const rows = (infiniteQuery.data?.rows ?? []) as Record<string, unknown>[];
  const listLoading = infiniteQuery.isLoading;
  const error = infiniteQuery.error ?? undefined;

  // Single 모드: 선택된 값 로드 (라벨 미리보기용, useList 단건 조회로 캐시 공유)
  const singleValue = !multiple && isNotEmpty(value) ? (value as TValue) : null;

  const selectedInRows = useMemo(
    () => rows.find((row) => row[valueField] === singleValue),
    [rows, singleValue, valueField],
  );

  const shouldLoadById = singleValue != null && !selectedInRows;
  const selectedQuery = config.useList(
    subset,
    { id: singleValue, num: 1, page: 1 },
    { enabled: shouldLoadById },
  );

  const selectedRow =
    (selectedQuery.data?.rows as Record<string, unknown>[] | undefined)?.[0] || selectedInRows;

  // Multi 모드: 선택된 값들 로드 (라벨 미리보기용)
  const multiValues = multiple && Array.isArray(value) ? value : [];

  const selectedMultiInRows = useMemo(
    () => multiValues.map((val) => rows.find((row) => row[valueField] === val)).filter(Boolean),
    [rows, multiValues, valueField],
  );

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

  const multiSelectedRows = useMemo(() => {
    const queryRows = (multiSelectedQuery.data?.rows ?? []) as Record<string, unknown>[];
    return [...selectedMultiInRows, ...queryRows] as Record<string, unknown>[];
  }, [selectedMultiInRows, multiSelectedQuery.data]);

  const isLoading =
    listLoading ||
    (shouldLoadById && selectedQuery.isLoading) ||
    (shouldLoadByIds && multiSelectedQuery.isLoading);

  // 캐시 제어
  // 드롭다운이 닫힐 때 이 subset의 모든 infinite 쿼리를 reset하여
  // 재오픈 시 첫 페이지부터 fresh하게 시작하도록 합니다.
  const resetAllInfiniteQueriesForSubset = useCallback(() => {
    queryClient.resetQueries({
      predicate: (q) => {
        const key = q.queryKey as unknown[];
        return Array.isArray(key) && key[2] === "infinite" && key[3] === subset;
      },
    });
  }, [queryClient, subset]);

  // 이전 keyword의 infinite 쿼리를 제거하여 메모리 누수를 줄입니다.
  const removeInfiniteQueriesForKeyword = useCallback(
    (targetKeyword: string | undefined) => {
      queryClient.removeQueries({
        predicate: (q) => {
          const key = q.queryKey as unknown[];
          if (!Array.isArray(key) || key[2] !== "infinite" || key[3] !== subset) {
            return false;
          }
          const params = key[4] as { keyword?: unknown } | undefined;
          return params?.keyword === targetKeyword;
        },
      });
    },
    [queryClient, subset],
  );

  const prevKeywordRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevKeywordRef.current;
    if (prev !== keyword) {
      // 첫 마운트 때(prev === undefined, keyword === undefined)는 아무것도 제거하지 않도록
      // prev !== keyword 판단만으로 충분하지만, undefined → undefined는 등식이 성립하므로 자연 스킵됩니다.
      removeInfiniteQueriesForKeyword(prev);
    }
    prevKeywordRef.current = keyword;
  }, [keyword, removeInfiniteQueriesForKeyword]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetAllInfiniteQueriesForSubset();
      }
    },
    [resetAllInfiniteQueriesForSubset],
  );

  const handleLoadMore = useCallback(() => {
    if (infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
      infiniteQuery.fetchNextPage();
    }
  }, [infiniteQuery]);

  // itemMap + rowMap
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

  // Select 렌더링
  const valueKey = (v: TValue) => String(v);
  const hasMore = !!infiniteQuery.hasNextPage;
  const isLoadingMore = !!infiniteQuery.isFetchingNextPage;

  // isDropdown + !searchable 모드는 검색창 없이 목록을 즉시 노출하는 UX입니다.
  // UI 관점에서는 검색창이 없어야 하므로 async=false(sync)로 두되, Select base prop에 올라간
  // 무한스크롤/닫힘 훅(onOpenChange/onLoadMore/hasMore/isLoadingMore)은 그대로 릴레이하여
  // 바닥 도달 시 다음 페이지 로드와 닫힘 시 resetQueries가 작동하도록 합니다.
  if (isDropdown && !searchable) {
    if (!multiple) {
      return (
        <Select
          items={items}
          valueKey={valueKey}
          value={singleValue ?? undefined}
          onValueChange={(newValue: TValue | undefined) => {
            onValueChange?.(newValue);
            onRowChange?.((newValue ? rowMap.get(newValue) : undefined) as RowChangeParam);
          }}
          placeholder={placeholder ?? SD(config.placeholderKey)}
          clearable={clearable}
          disabled={disabled}
          className={className}
          multiple={false}
          onOpenChange={handleOpenChange}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
        />
      );
    }

    return (
      <Select
        items={items}
        valueKey={valueKey}
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
        onOpenChange={handleOpenChange}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />
    );
  }

  if (!multiple) {
    return (
      <Select
        items={items}
        value={singleValue ?? undefined}
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
        error={error}
        onSearch={handleSearch}
        onOpenChange={handleOpenChange}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
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
      error={error}
      onSearch={handleSearch}
      onOpenChange={handleOpenChange}
      onLoadMore={handleLoadMore}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
    />
  );
}
