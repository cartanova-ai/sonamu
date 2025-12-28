import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { CompanyOrderBy, CompanyOrderByLabel } from "@/services/sonamu.generated";

export type CompanyOrderBySelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function CompanyOrderBySelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: CompanyOrderBySelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = CompanyOrderBy.options.filter((key) => (key as string) !== "");

  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "정렬"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">전체</SelectItem>}
        {validOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + CompanyOrderByLabel[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
