import { Select } from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";

import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { createFormEvent } from "./form-event";

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

const EMPTY_VALUES: string[] = [];

export function TableColumnAsyncSelect({
  entityId,
  allowedTypes,
  value = EMPTY_VALUES,
  onChange,
  onValueChange,
  placeholder = "Columns",
  disabled,
  className,
}: TableColumnAsyncSelectProps) {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [editedValues, setEditedValues] = useState<{ origin: string[]; value: string[] }>();
  const selectedValues = editedValues?.origin === value ? editedValues.value : value;

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
    setEditedValues({ origin: value, value: newValue });
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      onChange(createFormEvent(), { value: newValue });
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
