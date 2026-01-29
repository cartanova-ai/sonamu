import { Select } from "@sonamu-kit/react-components/components";

import { FileOrderBy, FileOrderByLabel } from "@/services/sonamu.generated";

export type FileOrderBySelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function FileOrderBySelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: FileOrderBySelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = FileOrderBy.options.filter((key) => (key as string) !== "");

  const items = [
    ...(clearable ? [{ value: "", label: "전체" }] : []),
    ...validOptions.map((key) => ({
      value: key,
      label: (textPrefix ?? "") + FileOrderByLabel[key],
    })),
  ];

  return (
    <Select
      value={value ?? ""}
      onValueChange={onValueChange}
      disabled={disabled}
      items={items}
      placeholder={placeholder ?? "정렬"}
      className={className}
    />
  );
}
