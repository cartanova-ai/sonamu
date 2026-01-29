import { Select } from "@sonamu-kit/react-components/components";

import { CompanySearchField, CompanySearchFieldLabel } from "@/services/sonamu.generated";

export type CompanySearchFieldSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function CompanySearchFieldSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: CompanySearchFieldSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = CompanySearchField.options.filter((key) => (key as string) !== "");

  const items = [
    ...(clearable ? [{ value: "", label: "전체" }] : []),
    ...validOptions.map((key) => ({
      value: key,
      label: (textPrefix ?? "") + CompanySearchFieldLabel[key],
    })),
  ];

  return (
    <Select
      value={value ?? ""}
      onValueChange={onValueChange}
      disabled={disabled}
      items={items}
      placeholder={placeholder ?? "검색"}
      className={className}
    />
  );
}
