import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useQueryClient,
} from "@tanstack/react-query";
import { isFunction, isNumber, isObject, isString } from "radashi";
import {
  type ComponentType,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSonamuBaseContext } from "@/contexts";

import { Select } from "./select";

// ============================================================================
// Type Definition
// ============================================================================

type DefaultAsyncIdRow = { id?: string | number };
type DefaultSubsetMapping = { default: DefaultAsyncIdRow };
interface DefaultListParams {
  keyword?: string;
  search?: string;
  orderBy?: string;
  queryMode?: string;
  id?: string | number | readonly (string | number)[] | null;
  num?: number;
  page?: number;
}
type ListQueryParams<TListParams extends object> = Partial<TListParams> | DefaultListParams;
type ListData<Row> = { rows: Row[]; total: number };
type ConfigRow<TSubsetKey extends string, TSubsetMapping> = TSubsetMapping[TSubsetKey &
  keyof TSubsetMapping] &
  object;

// AsyncIdConfig 타입
// services.generated.ts에서 생성되는 config와 호환됨
// _TSubsetMapping은 onRowChange의 타입 추론에 사용됨
// _TListParams는 baseListParams의 타입 추론에 사용됨
export type AsyncIdConfig<
  TSubsetKey extends string = string,
  TSubsetMapping = DefaultSubsetMapping,
  _TListParams extends object = DefaultListParams,
> = {
  placeholderKey: string;
  useList(
    subset: TSubsetKey,
    params?: ListQueryParams<_TListParams>,
    options?: { enabled?: boolean },
  ): UseQueryResult<ListData<ConfigRow<TSubsetKey, TSubsetMapping>>>;
  // 무한스크롤용. sonamu services 생성기가 항상 주입합니다.
  // select로 rows/total이 평탄화되어 내려옵니다.
  useListInfinite(
    subset: TSubsetKey,
    params?: ListQueryParams<_TListParams>,
    options?: { enabled?: boolean },
  ): UseInfiniteQueryResult<
    InfiniteData<ListData<ConfigRow<TSubsetKey, TSubsetMapping>>> & {
      rows: ConfigRow<TSubsetKey, TSubsetMapping>[];
      total: number;
    },
    Error
  >;
};

// SubsetMapping에서 선택된 subset의 필드 키를 추출하는 유틸리티 타입
type SubsetFieldKeys<
  TSubsetKey extends string,
  TSubsetMapping,
> = TSubsetKey extends keyof TSubsetMapping ? string & keyof TSubsetMapping[TSubsetKey] : string;

// SubsetMapping에서 선택된 subset의 row 타입을 추출하는 유틸리티 타입
type SubsetRow<TSubsetKey extends string, TSubsetMapping> = TSubsetKey extends keyof TSubsetMapping
  ? TSubsetMapping[TSubsetKey]
  : DefaultAsyncIdRow;

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
  TSubsetMapping = DefaultSubsetMapping,
  TValue extends string | number = string,
  TListParams extends object = DefaultListParams,
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
  TSubsetMapping = DefaultSubsetMapping,
  TValue extends string | number = string,
  TListParams extends object = DefaultListParams,
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
function detectDisplayField<Row extends object>(row: Row): string {
  // 1) name-like 필드 찾기
  const entries = Object.entries(row);
  for (const field of NAME_LIKE_FIELDS) {
    if (entries.some(([key]) => key === field)) {
      return field;
    }
  }
  // 2) string 타입인 첫 번째 컨럼 (id 제외)
  for (const [key, val] of entries) {
    if (key !== "id" && isString(val)) {
      return key;
    }
  }
  // 3) fallback
  return "id";
}

function getFieldValue<Row extends object>(row: Row, field: string): Row[keyof Row] | undefined {
  if (!(field in row)) return undefined;
  // SAFETY: 속성 존재 여부를 검사했으므로 field는 이 분기에서 row의 키입니다.
  return row[field as keyof Row];
}

function getIdentifierValue<Row extends object>(
  row: Row,
  field: string,
): string | number | undefined {
  const value = getFieldValue(row, field);
  return isString(value) || isNumber(value) ? value : undefined;
}

function isSingleValue<Value extends string | number>(
  value: Value | Value[] | null | undefined,
): value is Value {
  return !Array.isArray(value) && isNotEmptyValue(value);
}

function isNotEmptyValue<Field>(value: Field): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (!isNumber(value)) return true;
  return value !== 0;
}

function stringifyValue(value: string | number): string {
  return String(value);
}

const configuredSelectCache = new WeakMap<object, ComponentType<never>>();

function createConfiguredIdAsyncSelect<
  TSubsetKey extends string = string,
  TSubsetMapping = DefaultSubsetMapping,
  TValue extends string | number = string,
  TListParams extends object = DefaultListParams,
  TSubset extends TSubsetKey = TSubsetKey,
>(configuredConfig: AsyncIdConfig<TSubsetKey, TSubsetMapping, TListParams>) {
  const useList = configuredConfig.useList;
  const useListInfinite = configuredConfig.useListInfinite;

  return function ConfiguredIdAsyncSelect({
    subset,
    baseListParams,
    displayField,
    // SAFETY: 기본 subset 행은 생성 계약상 id 필드를 식별자로 사용합니다.
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
  }: Omit<IdAsyncSelectProps<TSubsetKey, TSubsetMapping, TValue, TListParams, TSubset>, "config">) {
    const { SD } = useSonamuBaseContext();
    const queryClient = useQueryClient();

    // onRowChange의 파라미터 타입
    type RowChangeParam = Parameters<NonNullable<typeof onRowChange>>[0];
    type Row = ConfigRow<TSubsetKey, TSubsetMapping>;

    // displayField 해석: 콜백 / 필드명 / 자동탐지
    const isDisplayFieldCallback = isFunction(displayField);

    // row에서 label을 추출하는 함수
    const getLabel = useCallback(
      (row: Row): string => {
        if (isDisplayFieldCallback) {
          // SAFETY: config 조회는 현재 subset으로 실행되어 해당 subset 행만 반환합니다.
          return displayField(row as SubsetRow<TSubset, TSubsetMapping>);
        }
        const field = isString(displayField) ? displayField : detectDisplayField(row);
        return String(getFieldValue(row, field) ?? "");
      },
      [displayField, isDisplayFieldCallback],
    );

    // keyword 상태 관리 (사용자 입력 검색어만 관리)
    const [keyword, setKeyword] = useState<string | undefined>();

    // handleSearch는 keyword state만 갱신합니다.
    // 캐시 삭제 오버로딩 금지: backspace로 검색어를 전부 지운 케이스와 드롭다운 닫힘을 구분할 수 없으면
    // multi 모드에서 영구 빈 상태에 빠집니다. 닫힘 신호는 오직 onOpenChange로 받습니다.
    const handleSearch = useCallback((kw: string) => {
      setKeyword(kw || undefined);
    }, []);

    // 유틸
    // baseListParams에 search/orderBy/queryMode 외의 의미 있는 필터값이 있는지 확인
    const IGNORED_FILTER_KEYS = new Set([
      "search",
      "orderBy",
      "queryMode",
      "num",
      "page",
      "keyword",
    ]);
    const hasBaseFilter =
      baseListParams &&
      Object.entries(baseListParams).some(
        ([k, v]) => !IGNORED_FILTER_KEYS.has(k) && isNotEmptyValue(v),
      );

    // preload 또는 baseFilter가 있으면 드롭다운 모드로 취급 (비검색 상태에서도 목록 즉시 노출)
    const isDropdown = preload || hasBaseFilter;

    // 리스트 조회는 항상 useListInfinite 단일 경로
    // baseListParams(외부 필터) + keyword(사용자 검색어) 병합
    const queryParams: ListQueryParams<TListParams> = keyword
      ? { ...baseListParams, keyword }
      : { ...baseListParams };

    const infiniteEnabled =
      isDropdown ||
      (keyword !== undefined && keyword.length > 0) ||
      (multiple && Array.isArray(value) && value.length > 0);

    const infiniteQuery = useListInfinite(subset, queryParams, {
      enabled: infiniteEnabled,
    });

    const rows = infiniteQuery.data?.rows ?? [];
    const listLoading = infiniteQuery.isLoading;
    const error = infiniteQuery.error ?? undefined;

    // Single 모드: 선택된 값 로드 (라벨 미리보기용, useList 단건 조회로 캐시 공유)
    const singleValue = !multiple && isSingleValue(value) ? value : null;

    const selectedInRows = useMemo(
      () => rows.find((row) => getIdentifierValue(row, valueField) === singleValue),
      [rows, singleValue, valueField],
    );

    const shouldLoadById = singleValue !== null && !selectedInRows;
    const selectedQuery = useList(
      subset,
      { id: singleValue, num: 1, page: 1 },
      { enabled: shouldLoadById },
    );

    const selectedRow = selectedQuery.data?.rows[0] || selectedInRows;

    // Multi 모드: 선택된 값들 로드 (라벨 미리보기용)
    const multiValues = multiple && Array.isArray(value) ? value : [];

    const selectedMultiInRows = useMemo(
      () =>
        multiValues.flatMap((val) => {
          const row = rows.find((candidate) => getIdentifierValue(candidate, valueField) === val);
          return row ? [row] : [];
        }),
      [rows, multiValues, valueField],
    );

    const selectedMultiIds = useMemo(() => {
      const foundIds = new Set(
        selectedMultiInRows.map((row) => (row ? getIdentifierValue(row, valueField) : undefined)),
      );
      return multiValues.filter((val) => !foundIds.has(val));
    }, [multiValues, selectedMultiInRows, valueField]);

    const shouldLoadByIds = selectedMultiIds.length > 0;
    const multiSelectedQuery = useList(
      subset,
      { id: selectedMultiIds, num: selectedMultiIds.length, page: 1 },
      { enabled: shouldLoadByIds },
    );

    const multiSelectedRows = useMemo(() => {
      const queryRows = multiSelectedQuery.data?.rows ?? [];
      return [...selectedMultiInRows, ...queryRows];
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
          const key = q.queryKey;
          return Array.isArray(key) && key[2] === "infinite" && key[3] === subset;
        },
      });
    }, [queryClient, subset]);

    // 이전 keyword의 infinite 쿼리를 제거하여 메모리 누수를 줄입니다.
    const removeInfiniteQueriesForKeyword = useCallback(
      (targetKeyword: string | undefined) => {
        queryClient.removeQueries({
          predicate: (q) => {
            const key = q.queryKey;
            if (!Array.isArray(key) || key[2] !== "infinite" || key[3] !== subset) {
              return false;
            }
            const params = key[4];
            if (!isObject(params)) return false;
            return getFieldValue(params, "keyword") === targetKeyword;
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
      const nextRowMap = new Map<TValue, Row>();
      const itemMap = new Map<TValue, { value: TValue; label: string }>();

      // Single 모드: 선택된 항목 추가
      if (!multiple && selectedRow && singleValue !== null) {
        nextRowMap.set(singleValue, selectedRow);
        itemMap.set(singleValue, {
          value: singleValue,
          label: getLabel(selectedRow),
        });
      }

      // Multi 모드: 선택된 항목들 추가
      if (multiple && multiSelectedRows.length > 0) {
        for (const row of multiSelectedRows) {
          // SAFETY: valueField는 생성된 subset의 TValue 식별자 필드입니다.
          const val = getIdentifierValue(row, valueField) as TValue;
          nextRowMap.set(val, row);
          itemMap.set(val, {
            value: val,
            label: getLabel(row),
          });
        }
      }

      // 검색 결과 추가
      for (const row of rows) {
        // SAFETY: valueField는 생성된 subset의 TValue 식별자 필드입니다.
        const val = getIdentifierValue(row, valueField) as TValue;
        nextRowMap.set(val, row);
        itemMap.set(val, {
          value: val,
          label: getLabel(row),
        });
      }

      return {
        items: Array.from(itemMap.values()),
        rowMap: nextRowMap,
      };
    }, [rows, selectedRow, singleValue, multiSelectedRows, multiple, getLabel, valueField]);

    // Select 렌더링
    const hasMore = !!infiniteQuery.hasNextPage;
    const isLoadingMore = !!infiniteQuery.isFetchingNextPage;

    // isDropdown 모드는 검색창 없이 목록을 즉시 노출하는 UX가 기본입니다.
    // 데이터 소스는 어느 모드든 동일하게 서버(useListInfinite)이므로 async=true 경로로 통일하고,
    // 검색창 노출 여부만 searchable 축으로 제어합니다. 기본값은 isDropdown일 때 false, 그 외는 true이며
    // 호출자가 searchable을 명시하면 명시값이 우선합니다.
    const searchableDefault = !isDropdown;
    const isSearchableVisible = searchable ?? searchableDefault;

    if (!multiple) {
      return (
        <Select
          items={items}
          valueKey={stringifyValue}
          value={singleValue ?? undefined}
          onValueChange={(newValue: TValue | undefined) => {
            onValueChange?.(newValue);
            // SAFETY: 단일 모드 콜백은 생성된 subset 행 하나만 받습니다.
            onRowChange?.((newValue ? rowMap.get(newValue) : undefined) as RowChangeParam);
          }}
          placeholder={placeholder ?? SD(configuredConfig.placeholderKey)}
          clearable={clearable}
          disabled={disabled}
          className={className}
          multiple={false}
          async={true}
          searchable={isSearchableVisible}
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
        valueKey={stringifyValue}
        value={multiValues}
        onValueChange={(newValue: TValue[]) => {
          onValueChange?.(newValue);
          const selectedRows = newValue.flatMap((val) => {
            const row = rowMap.get(val);
            return row ? [row] : [];
          });
          // SAFETY: 다중 모드 콜백은 생성된 subset 행 배열만 받습니다.
          onRowChange?.(selectedRows as RowChangeParam);
        }}
        placeholder={placeholder ?? SD(configuredConfig.placeholderKey)}
        clearable={clearable}
        disabled={disabled}
        className={className}
        multiple={true}
        async={true}
        searchable={isSearchableVisible}
        loading={isLoading}
        error={error}
        onSearch={handleSearch}
        onOpenChange={handleOpenChange}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />
    );
  };
}

function getConfiguredIdAsyncSelect<
  TSubsetKey extends string,
  TSubsetMapping,
  TValue extends string | number,
  TListParams extends object,
  TSubset extends TSubsetKey,
>(config: AsyncIdConfig<TSubsetKey, TSubsetMapping, TListParams>) {
  type Props = Omit<
    IdAsyncSelectProps<TSubsetKey, TSubsetMapping, TValue, TListParams, TSubset>,
    "config"
  >;

  const cached = configuredSelectCache.get(config);
  if (cached) {
    // SAFETY: 캐시 키와 컴포넌트는 같은 config 및 제네릭 인자로 함께 생성됩니다.
    return cached as ComponentType<Props>;
  }

  const configured = createConfiguredIdAsyncSelect<
    TSubsetKey,
    TSubsetMapping,
    TValue,
    TListParams,
    TSubset
  >(config);
  // SAFETY: 캐시는 런타임 config 객체로 다시 타입을 복원하므로 저장 시 props 타입만 소거합니다.
  configuredSelectCache.set(config, configured as ComponentType<never>);
  return configured;
}

export function IdAsyncSelect<
  TSubsetKey extends string = string,
  TSubsetMapping = DefaultSubsetMapping,
  TValue extends string | number = string,
  TListParams extends object = DefaultListParams,
  TSubset extends TSubsetKey = TSubsetKey,
>({
  config,
  ...props
}: IdAsyncSelectProps<TSubsetKey, TSubsetMapping, TValue, TListParams, TSubset>) {
  const configuredIdAsyncSelect = getConfiguredIdAsyncSelect<
    TSubsetKey,
    TSubsetMapping,
    TValue,
    TListParams,
    TSubset
  >(config);

  return createElement(configuredIdAsyncSelect, props);
}
