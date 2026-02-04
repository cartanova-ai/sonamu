import { useCallback, useMemo, useState } from "react";
import { useSonamuBaseContext } from "@/contexts";
import { SelectNew } from "./select-new";

// ============================================================================
// Type Definition
// ============================================================================

// AsyncIdConfig 타입
// services.generated.ts에서 생성되는 config와 호환됨
export type AsyncIdConfig = {
  placeholderKey: string;
  useList: (
    subset: string,
    params?: Record<string, unknown>,
    options?: { enabled?: boolean },
  ) => {
    data?: { rows: Record<string, unknown>[] };
    isLoading: boolean;
    error?: Error;
  };
};

// IdAsyncSelect Props
export type IdAsyncSelectProps<TValue extends string | number = string> = {
  // Entity Async ID Config
  config: AsyncIdConfig;
  // Entity subset key
  subset: string;
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
};

// ============================================================================
// Component
// ============================================================================

export function IdAsyncSelect<TValue extends string | number = string>({
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
}: IdAsyncSelectProps<TValue>) {
  const { SD } = useSonamuBaseContext();

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
  const { rows = [] } = data ?? {};

  // ============================================================
  // Single 모드: 선택된 값 로드
  // ============================================================
  const singleValue = !multiple && isNotEmpty(value) ? (value as TValue) : null;

  // 먼저 현재 rows에서 찾기
  const selectedInRows = useMemo(
    () => rows.find((row) => row[valueField] === singleValue),
    [rows, singleValue, valueField],
  );

  // rows에 없고, 검색어가 없을 때만 id로 조회
  const shouldLoadById = singleValue != null && !selectedInRows && !keyword;
  const selectedQuery = config.useList(
    subset,
    { id: singleValue, num: 1, page: 1 },
    { enabled: shouldLoadById },
  );

  // selectedQuery로 로드한 데이터가 있으면 우선 사용, 없으면 현재 rows에서 찾기
  const selectedRow = selectedQuery.data?.rows[0] || selectedInRows;
  const isLoading = listLoading || (shouldLoadById && selectedQuery.isLoading);

  // ============================================================
  // 옵션 생성
  // ============================================================
  const items = useMemo(() => {
    const toItem = (row: Record<string, unknown>, val: TValue) => ({
      value: val,
      label: String(row[displayField]),
    });

    const list: Array<{ row: Record<string, unknown>; val: TValue }> = [];

    // 선택된 항목 추가
    if (selectedRow && singleValue != null) {
      list.push({ row: selectedRow, val: singleValue });
    }

    // 검색 결과 추가
    for (const row of rows) {
      list.push({ row, val: row[valueField] as TValue });
    }

    // 중복 제거
    const map = new Map<TValue, { value: TValue; label: string }>();
    for (const { row, val } of list) {
      map.set(val, toItem(row, val));
    }

    return Array.from(map.values());
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
      />
    );
  }

  return (
    <SelectNew
      items={items}
      value={(value as TValue[]) ?? []}
      onValueChange={(newValue: TValue[]) => {
        onValueChange?.(newValue);
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
    />
  );
}
