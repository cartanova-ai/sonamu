import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { UserSearchFieldLabel } from "@/services/sonamu.generated";

export type UserSearchFieldDropdownProps = {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function UserSearchFieldDropdown({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: UserSearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(UserSearchFieldLabel).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
