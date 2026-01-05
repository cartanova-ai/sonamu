import { MultiSelect, type MultiSelectOption } from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";

type TableColumnAsyncSelectProps = {
  entityId: string;
  allowedTypes?: string[];
  value?: string[];
  onChange?: (event: React.FormEvent, data: { value: string[] }) => void;
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function TableColumnAsyncSelect({
  entityId,
  allowedTypes,
  value = [],
  onChange,
  onValueChange,
  placeholder = "Columns",
  disabled,
  className,
}: TableColumnAsyncSelectProps) {
  const [options, setOptions] = useState<MultiSelectOption[]>([]);

  useEffect(() => {
    SonamuUIService.getTableColumns(entityId)
      .then(({ columns }) => {
        const filteredColumns = allowedTypes
          ? columns.filter((c) => allowedTypes.includes(c.type))
          : columns;

        setOptions(
          filteredColumns.map((c) => ({
            label: c.name,
            value: c.name,
          })),
        );
      })
      .catch(defaultCatch);
  }, [entityId, allowedTypes]);

  const handleValueChange = (newValue: string[]) => {
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      onChange({} as React.FormEvent, { value: newValue });
    }
  };

  return (
    <MultiSelect
      options={options}
      value={value}
      onValueChange={handleValueChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
