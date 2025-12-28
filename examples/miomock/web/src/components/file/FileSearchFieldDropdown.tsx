import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { FileSearchFieldLabel } from "@/services/sonamu.generated";

export type FileSearchFieldDropdownProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function FileSearchFieldDropdown({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
}: FileSearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(FileSearchFieldLabel).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
