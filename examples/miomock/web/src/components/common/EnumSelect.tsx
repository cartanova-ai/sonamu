import {
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";

export type EnumSelectProps = {
  enumOptions: string[];
  enumLabels: Record<string, string>;
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  isMulti?: boolean;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Enum 선택 컴포넌트 (단일/다중 통합)
 *
 * @param isMulti - true면 MultiSelect, false면 Select 사용
 */
export function EnumSelect({
  enumOptions,
  enumLabels,
  value,
  onValueChange,
  isMulti = false,
  placeholder,
  clearable,
  disabled,
  className,
}: EnumSelectProps) {
  if (isMulti) {
    // MultiSelect 사용 (in/notIn)
    const options = enumOptions.map((key) => ({
      label: enumLabels[key] ?? key,
      value: key,
    }));

    return (
      <MultiSelect
        options={options}
        value={(value as string[]) ?? []}
        onValueChange={onValueChange as (value: string[]) => void}
        placeholder={placeholder ?? "선택..."}
        disabled={disabled}
        className={className}
      />
    );
  }

  // Select 사용 (eq/ne)
  return (
    <Select
      value={(value as string) ?? ""}
      onValueChange={(v) => onValueChange?.(v ?? "")}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "선택..."} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">전체</SelectItem>}
        {enumOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {enumLabels[key] ?? key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
