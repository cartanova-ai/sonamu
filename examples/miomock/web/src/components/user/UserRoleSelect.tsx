import { Select } from "@sonamu-kit/react-components/components";

import { UserRole, UserRoleLabel } from "@/services/sonamu.generated";

export type UserRoleSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function UserRoleSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: UserRoleSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = UserRole.options.filter((key) => (key as string) !== "");

  const items = [
    ...(clearable ? [{ value: "", label: "전체" }] : []),
    ...validOptions.map((key) => ({
      value: key,
      label: (textPrefix ?? "") + UserRoleLabel[key],
    })),
  ];

  return (
    <Select
      value={value ?? ""}
      onValueChange={onValueChange}
      disabled={disabled}
      items={items}
      placeholder={placeholder ?? "ROLE"}
      className={className}
    />
  );
}
