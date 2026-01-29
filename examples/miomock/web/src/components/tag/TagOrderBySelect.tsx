import { Select } from "@sonamu-kit/react-components/components";
import { SD } from "@/i18n/sd.generated";
import { TagOrderBy } from "@/services/sonamu.generated";

export type TagOrderBySelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function TagOrderBySelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: TagOrderBySelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = TagOrderBy.options.filter((key) => (key as string) !== "");
  const enumLabels = SD.enumLabels("TagOrderBy");

  const items = [
    ...(clearable ? [{ value: "", label: SD("common.all") }] : []),
    ...validOptions.map((key) => ({
      value: key,
      label: (textPrefix ?? "") + enumLabels[key],
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
