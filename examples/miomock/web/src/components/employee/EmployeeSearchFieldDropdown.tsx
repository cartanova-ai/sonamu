import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";

import { EmployeeSearchFieldLabel } from "@/services/sonamu.generated";

export type EmployeeSearchFieldDropdownProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function EmployeeSearchFieldDropdown({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
}: EmployeeSearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(EmployeeSearchFieldLabel).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
