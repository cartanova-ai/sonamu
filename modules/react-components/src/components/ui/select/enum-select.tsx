import * as React from "react";
import { SelectNew } from "./select-new";

// ============================================================================
// Type Definition
// ============================================================================

// EnumSelect Props
// Duck typing: enum은 .options 속성만 있으면 됨 (Zod enum 또는 호환 타입)
export type EnumSelectProps<TValue extends string = string> = {
  enum: { options: readonly TValue[] };
  labels: Record<TValue, string>;
  value?: TValue | "";
  onValueChange?: (value: TValue | "" | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
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
}: EnumSelectProps<TValue>) {
  // Zod enum에서 options 추출 (빈 문자열 필터링 - Radix UI 제약)
  const validOptions = React.useMemo(() => {
    return zodEnum.options.filter((key: unknown) => (key as string) !== "") as TValue[];
  }, [zodEnum]);

  // items 구성
  const items = React.useMemo(() => {
    return validOptions.map((key) => ({
      value: key as string,
      label: textPrefix + labels[key],
    }));
  }, [validOptions, labels, textPrefix]);

  return (
    <SelectNew
      items={items}
      value={value ?? ""}
      onValueChange={(newValue) => {
        onValueChange?.(newValue as TValue | "" | null | undefined);
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
