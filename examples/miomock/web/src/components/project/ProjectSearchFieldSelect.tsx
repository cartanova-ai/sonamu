import { Select } from "@sonamu-kit/react-components/components";

import { ProjectSearchField, ProjectSearchFieldLabel } from "@/services/sonamu.generated";

export type ProjectSearchFieldSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ProjectSearchFieldSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: ProjectSearchFieldSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = ProjectSearchField.options.filter((key) => (key as string) !== "");

  const items = [
    ...(clearable ? [{ value: "", label: "전체" }] : []),
    ...validOptions.map((key) => ({
      value: key,
      label: (textPrefix ?? "") + ProjectSearchFieldLabel[key],
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
