import {
  MultiSelect,
  type MultiSelectOption,
  type MultiSelectRef,
} from "@sonamu-kit/react-components";
import { useEffect, useRef, useState } from "react";
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
  const multiSelectRef = useRef<MultiSelectRef>(null);

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

  // value prop이 변경되면 MultiSelect의 내부 상태를 업데이트
  useEffect(() => {
    if (multiSelectRef.current && options.length > 0) {
      const currentValues = multiSelectRef.current.getSelectedValues();
      const valuesChanged =
        currentValues.length !== value.length || currentValues.some((v, idx) => v !== value[idx]);

      if (valuesChanged) {
        multiSelectRef.current.setSelectedValues(value);
      }
    }
  }, [value, options]);

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
      ref={multiSelectRef}
      options={options}
      defaultValue={value}
      onValueChange={handleValueChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
