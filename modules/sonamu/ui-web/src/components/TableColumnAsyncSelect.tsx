import { Select } from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";

import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";

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
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [selectedValues, setSelectedValues] = useState(value);

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

  // value prop이 변경되면 내부 상태를 업데이트
  useEffect(() => {
    setSelectedValues(value);
  }, [value]);

  const handleValueChange = (newValue: string[]) => {
    setSelectedValues(newValue);
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      onChange({} as React.FormEvent, { value: newValue });
    }
  };

  return (
    <Select
      multiple
      items={options}
      value={selectedValues}
      onValueChange={handleValueChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
