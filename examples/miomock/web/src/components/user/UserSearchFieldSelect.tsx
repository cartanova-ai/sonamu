import { Select } from "@sonamu-kit/react-components/components";

import { UserSearchField, UserSearchFieldLabel } from "@/services/sonamu.generated";

export type UserSearchFieldSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function UserSearchFieldSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: UserSearchFieldSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = UserSearchField.options.filter((key) => (key as string) !== "");

  const items = [
    ...(clearable ? [{ value: "", label: "전체" }] : []),
    ...validOptions.map((key) => ({
      value: key,
      label: (textPrefix ?? "") + UserSearchFieldLabel[key],
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
