import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";

import { FileOrderBy, FileOrderByLabel } from "@/services/sonamu.generated";

export type FileOrderBySelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function FileOrderBySelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: FileOrderBySelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = FileOrderBy.options.filter((key) => (key as string) !== "");

  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "정렬"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">전체</SelectItem>}
        {validOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + FileOrderByLabel[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
