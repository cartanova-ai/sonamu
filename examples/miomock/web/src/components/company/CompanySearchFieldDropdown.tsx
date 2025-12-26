import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { CompanySearchFieldLabel } from "@/services/sonamu.generated";

export type CompanySearchFieldDropdownProps = {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function CompanySearchFieldDropdown({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: CompanySearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(CompanySearchFieldLabel).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
