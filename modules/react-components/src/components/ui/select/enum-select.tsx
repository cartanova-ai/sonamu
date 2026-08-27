import * as React from "react";

import { Select } from "./select";

// ============================================================================
// Type Definition
// ============================================================================

// EnumSelect Props
export type EnumSelectProps<TValue extends string = string> = {
  enum: { options: readonly TValue[] };
  labels: Record<TValue, string>;
  value?: TValue | TValue[] | "";
  onValueChange?: (value: TValue | TValue[] | "" | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function EnumSelect<TValue extends string = string>({
  enum: zodEnum,
  labels,
  value,
  onValueChange,
  placeholder,
  textPrefix = "",
  clearable = false,
  disabled = false,
  className,
  multiple = false,
}: EnumSelectProps<TValue>) {
  // Zod enum에서 options 추출 (빈 문자열 필터링 - Radix UI 제약)
  const validOptions = React.useMemo(() => {
    return zodEnum.options.filter((key) => key !== "");
  }, [zodEnum]);

  // items 구성
  const items = React.useMemo(() => {
    return validOptions.map((key) => ({
      value: key,
      label: textPrefix + labels[key],
    }));
  }, [validOptions, labels, textPrefix]);

  // Single 모드
  if (!multiple) {
    return (
      <Select
        items={items}
        valueKey={(optionValue) => optionValue}
        value={Array.isArray(value) || value === "" ? undefined : value}
        onValueChange={(newValue: TValue | undefined) => {
          onValueChange?.(newValue);
        }}
        placeholder={placeholder}
        clearable={clearable}
        disabled={disabled}
        className={className}
        multiple={false}
        async={false}
      />
    );
  }

  // Multiple 모드
  return (
    <Select
      items={items}
      valueKey={(optionValue) => optionValue}
      value={Array.isArray(value) ? value : []}
      onValueChange={(newValue: TValue[]) => {
        onValueChange?.(newValue);
      }}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      multiple={true}
      async={false}
    />
  );
}
