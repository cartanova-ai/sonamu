/** biome-ignore-all lint/suspicious/noExplicitAny: AsyncIdConfig의 useList params는 contravariance 때문에 any 필요 (unknown 사용시 구체적 타입 전달 불가) */
import { useCallback, useMemo, useState } from "react";
import { useSonamuBaseContext } from "@/contexts";
import { SelectNew } from "./select-new";

// ============================================================================
// Type Definition
// ============================================================================

// AsyncIdConfig 타입
// services.generated.ts에서 생성되는 config와 호환됨
// TSubsetMapping은 onRowChange의 타입 추론에 사용됨
export type AsyncIdConfig<
  TSubsetKey extends string = string,
  _TSubsetMapping = Record<string, unknown>,
> = {
  placeholderKey: string;
  useList: <T extends TSubsetKey>(
    subset: T,
    params?: any,
    options?: { enabled?: boolean },
  ) => {
    data?: { rows?: unknown[]; [key: string]: unknown };
    isLoading: boolean;
    error: Error | null;
  };
};

// onRowChange의 row 파라미터 타입
type OnRowChangeType<
  TSubsetKey extends string,
  TSubsetMapping,
> = TSubsetKey extends keyof TSubsetMapping
  ? TSubsetMapping[TSubsetKey] | TSubsetMapping[TSubsetKey][] | undefined
  : unknown;

// IdAsyncSelect Props
export type IdAsyncSelectProps<
  TSubsetKey extends string = string,
  TSubsetMapping = Record<string, unknown>,
  TValue extends string | number = string,
> = {
  // Entity Async ID Config
  config: AsyncIdConfig<TSubsetKey, TSubsetMapping>;
  // Entity subset key
  subset: TSubsetKey;
  // 검색/조회 시 적용될 파라미터
  baseListParams?: Record<string, unknown>;
  // 드롭다운에 표시할 텍스트 필드명 (기본값: "name")
  displayField?: string;
  // 실제 저장/전송될 값의 필드명 (기본값: "id")
  valueField?: string;
  // 기본 SelectNew Props
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  // Single/Multi 모드
  multiple?: boolean;
  value?: TValue | TValue[] | null;
  onValueChange?: (value: TValue | TValue[] | undefined) => void;
  onRowChange?: (row: OnRowChangeType<TSubsetKey, TSubsetMapping>) => void;
};

// ============================================================================
// Component
// ============================================================================

export function IdAsyncSelect<
  TSubsetKey extends string = string,
  TSubsetMapping = Record<string, unknown>,
  TValue extends string | number = string,
>({
  config,
  subset,
  baseListParams,
  displayField = "name",
  valueField = "id",
  placeholder,
  clearable,
  disabled,
  className,
  multiple = false,
  value,
  onValueChange,
  onRowChange,
}: IdAsyncSelectProps<TSubsetKey, TSubsetMapping, TValue>) {
  const { SD } = useSonamuBaseContext();

  // onRowChange의 파라미터 타입
  type RowChangeParam = Parameters<NonNullable<typeof onRowChange>>[0];

  // ============================================================
  // listParams 상태 관리
  // ============================================================
  const [listParams, setListParams] = useState<Record<string, unknown>>(baseListParams ?? {});

  // ============================================================
  // handleSearch 로직
  // ============================================================
  const handleSearch = useCallback(
    (keyword: string) => {
      setListParams((prev) => ({
        ...prev,
        search: keyword ? displayField : undefined,
        keyword: keyword || undefined,
      }));
    },
    [displayField],
  );

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
  const isLoading = listLoading || (shouldLoadById && selectedQuery.isLoading);

  // ============================================================
  // itemMap + rowMap
  // ============================================================
  const { items, rowMap } = useMemo(() => {
    const rowMap = new Map<TValue, Record<string, unknown>>();
    const itemMap = new Map<TValue, { value: TValue; label: string }>();

    // 선택된 항목 추가
    if (selectedRow && singleValue != null) {
      rowMap.set(singleValue, selectedRow);
      itemMap.set(singleValue, {
        value: singleValue,
        label: String(selectedRow[displayField]),
      });
    }

    // 검색 결과 추가
    for (const row of rows) {
      const val = row[valueField] as TValue;
      rowMap.set(val, row);
      itemMap.set(val, {
        value: val,
        label: String(row[displayField]),
      });
    }

    return {
      items: Array.from(itemMap.values()),
      rowMap,
    };
  }, [rows, selectedRow, singleValue, displayField, valueField]);

  // ============================================================
  // SelectNew 렌더링
  // ============================================================
  if (!multiple) {
    return (
      <SelectNew
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
    <SelectNew
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
