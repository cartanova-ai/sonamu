import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import { SD } from "@/i18n/sd.generated";
import { TagSearchField } from "@/services/sonamu.generated";

export type TagSearchFieldSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function TagSearchFieldSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: TagSearchFieldSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = TagSearchField.options.filter((key) => (key as string) !== "");
  const enumLabels = SD.enumLabels("TagSearchField");

  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "검색"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">{SD("common.all")}</SelectItem>}
        {validOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + enumLabels[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
