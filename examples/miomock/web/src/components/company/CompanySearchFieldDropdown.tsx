import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";

import { CompanySearchFieldLabel } from "@/services/sonamu.generated";

export type CompanySearchFieldDropdownProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function CompanySearchFieldDropdown({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
}: CompanySearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
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
