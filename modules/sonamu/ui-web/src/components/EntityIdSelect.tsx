import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components";
import { SonamuUIService } from "../services/sonamu-ui.service";

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

  const handleValueChange = (newValue: string | null | undefined) => {
    if (!newValue) return;
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      onChange({} as React.FormEvent, { value: newValue });
    }
  };

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled || !entityIds || isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(entityIds ?? []).map((id) => (
          <SelectItem key={id} value={id}>
            {id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
