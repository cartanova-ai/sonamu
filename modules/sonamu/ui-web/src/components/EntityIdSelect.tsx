import { Select } from "@sonamu-kit/react-components";

import { SonamuUIService } from "../services/sonamu-ui.service";
import { createFormEvent } from "./form-event";

type EntityIdSelectProps = {
  value?: string;
  onChange?: (event: React.FormEvent, data: { value: string }) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  search?: boolean;
  className?: string;
};

export function EntityIdSelect({
  value,
  onChange,
  onValueChange,
  placeholder = "EntityId",
  disabled,
  className,
}: EntityIdSelectProps) {
  const { data, isLoading } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const entityIds = entities?.map((entity) => entity.id);

  const handleValueChange = (newValue: string | undefined) => {
    if (!newValue) return;
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      onChange(createFormEvent(), { value: newValue });
    }
  };

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled || !entityIds || isLoading}
      items={entityIds ?? []}
      placeholder={placeholder}
      className={className}
    />
  );
}
