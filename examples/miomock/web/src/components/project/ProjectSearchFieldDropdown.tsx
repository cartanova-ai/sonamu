import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { ProjectSearchFieldLabel } from "@/services/sonamu.generated";

export type ProjectSearchFieldDropdownProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function ProjectSearchFieldDropdown({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
}: ProjectSearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ProjectSearchFieldLabel).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
