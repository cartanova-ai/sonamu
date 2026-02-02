import { EnumSelect } from "@sonamu-kit/react-components/components";
import { ProjectStatus, ProjectStatusLabel } from "@/services/sonamu.generated";

export type ProjectStatusSelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ProjectStatusSelect({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: ProjectStatusSelectProps) {
  return (
    <EnumSelect
      enum={ProjectStatus}
      labels={ProjectStatusLabel}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder ?? "상태"}
      textPrefix={textPrefix}
      clearable={clearable}
      disabled={disabled}
      className={className}
    />
  );
}
