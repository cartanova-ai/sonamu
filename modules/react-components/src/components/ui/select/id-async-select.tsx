import * as React from "react";
import { SelectNew } from "./select-new";

// ============================================================================
// Type Definition
// ============================================================================

// AsyncIdConfig 타입
// services.generated.ts에서 생성되는 config와 호환됨
// Duck typing: 제네릭 없이 모든 useList 함수와 호환
export type AsyncIdConfig = {
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
  // Config
  config: AsyncIdConfig;
  subset: string;
  listParams?: Record<string, unknown>;
  // 필드 매핑
  textField?: string;
  valueField?: string;
  // 기본 SelectNew Props
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  onSearch?: (keyword: string) => void;
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
  listParams,
  textField = "name",
  valueField = "id",
  placeholder,
  clearable,
  disabled,
  className,
  onSearch,
  multiple = false,
  value,
  onValueChange,
}: IdAsyncSelectProps<TValue>) {
  const { data, isLoading, error } = config.useList(subset, listParams);
  const { rows = [] } = data ?? {};

  // 옵션 생성
  const items = React.useMemo(() => {
    return rows.map((row) => ({
      value: row[valueField] as TValue,
      label: String(row[textField]),
    }));
  }, [rows, textField, valueField]);

  // Single 모드
  if (!multiple) {
    return (
      <SelectNew
        items={items}
        value={value as TValue | undefined}
        onValueChange={onValueChange as (value: TValue | undefined) => void}
        placeholder={placeholder}
        clearable={clearable}
        disabled={disabled}
        className={className}
        multiple={false}
        async={true}
        loading={isLoading}
        error={error}
        onSearch={onSearch ?? (() => {})}
      />
    );
  }

  // Multi 모드
  return (
    <SelectNew
      items={items}
      value={(value as TValue[]) ?? []}
      onValueChange={onValueChange as (value: TValue[]) => void}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      multiple={true}
      async={true}
      loading={isLoading}
      error={error}
      onSearch={onSearch ?? (() => {})}
    />
  );
}
