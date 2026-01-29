import { Select } from "@sonamu-kit/react-components/components";
import { SD } from "@/i18n/sd.generated";
import { TagSearchField } from "@/services/sonamu.generated";

export type TagSearchFieldSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function TagSearchFieldSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: TagSearchFieldSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = TagSearchField.options.filter((key) => (key as string) !== "");
  const enumLabels = SD.enumLabels("TagSearchField");

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
      placeholder={placeholder ?? "검색"}
      className={className}
    />
  );
}
