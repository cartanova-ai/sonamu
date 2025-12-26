import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import type React from "react";

import { ProjectStatus, ProjectStatusLabel } from "@/services/sonamu.generated";

export type ProjectStatusSelectProps = {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ProjectStatusSelect({
  value,
  onChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: ProjectStatusSelectProps) {
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = ProjectStatus.options.filter((key) => (key as string) !== "");

  return (
    <Select value={value ?? ""} onChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "상태"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">전체</SelectItem>}
        {validOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + ProjectStatusLabel[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
