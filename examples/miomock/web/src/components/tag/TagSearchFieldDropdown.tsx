import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";

import { TagSearchFieldLabel } from "@/services/sonamu.generated";

export type TagSearchFieldDropdownProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function TagSearchFieldDropdown({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
}: TagSearchFieldDropdownProps) {
  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(TagSearchFieldLabel).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
