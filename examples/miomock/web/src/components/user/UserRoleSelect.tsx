import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { UserRole, UserRoleLabel } from "@/services/sonamu.generated";

export type UserRoleSelectProps = {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function UserRoleSelect({
  value,
  onChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: UserRoleSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = UserRole.options.filter((key) => (key as string) !== "");

  return (
    <Select value={value ?? ""} onChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "ROLE"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">전체</SelectItem>}
        {validOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + UserRoleLabel[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
