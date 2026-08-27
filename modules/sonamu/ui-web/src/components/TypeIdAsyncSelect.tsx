import { Button, Select } from "@sonamu-kit/react-components";
import { camelize } from "inflection";
import PlusIcon from "~icons/lucide/plus";
import RefreshCwIcon from "~icons/lucide/refresh-cw";

import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { createFormEvent } from "./form-event";

type TypeIdAsyncSelectProps = {
  filter?: "enums" | "types";
  withAddEnumButton?: {
    entityId: string;
    propName: string;
  };
  value?: string;
  onChange?: (event: React.FormEvent, data: { value: string }) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  search?: boolean;
  className?: string;
};

export function TypeIdAsyncSelect({
  filter,
  withAddEnumButton,
  value,
  onChange,
  onValueChange,
  placeholder = "TypeId",
  disabled,
  className,
}: TypeIdAsyncSelectProps) {
  const { data, isLoading, refetch } = SonamuUIService.useTypeIds(filter);
  const { typeIds } = data ?? {};

  const handleValueChange = (newValue: string | undefined) => {
    if (!newValue) return;
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      onChange(createFormEvent(), { value: newValue });
    }
  };

  const promptAddEnum = () => {
    if (!withAddEnumButton) {
      return;
    }

    const defEnumId = `${withAddEnumButton.entityId}${camelize(withAddEnumButton.propName)}`;
    const newEnumId = prompt("New Enum ID", defEnumId);
    if (!newEnumId) {
      return;
    }

    const { entityId } = withAddEnumButton;
    SonamuUIService.createEnumId({
      entityId,
      newEnumId,
    })
      .then(() => {
        refetch();
        setTimeout(() => {
          handleValueChange(newEnumId);
        }, 100);
      })
      .catch(defaultCatch);
  };

  return (
    <div className="flex gap-1">
      <Select
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled || !typeIds || isLoading}
        items={typeIds ?? []}
        placeholder={placeholder}
        className={className}
        searchable
      />
      <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0 px-2">
        <RefreshCwIcon className="h-4 w-4" />
      </Button>
      {withAddEnumButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => promptAddEnum()}
          className="shrink-0 px-2"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
