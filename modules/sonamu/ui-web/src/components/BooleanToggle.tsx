import { Switch } from "@sonamu-kit/react-components";
import type { FormEvent } from "react";

type BooleanToggleProps = {
  value: boolean;
  onChange?: (event: FormEvent<HTMLButtonElement>, data: { value: boolean }) => void;
  disabled?: boolean;
  className?: string;
};

export function BooleanToggle({ value, onChange, disabled, className }: BooleanToggleProps) {
  return (
    <Switch
      checked={value}
      onCheckedChange={(checked) => {
        if (onChange) {
          onChange({} as FormEvent<HTMLButtonElement>, { value: checked });
        }
      }}
      disabled={disabled}
      className={className}
    />
  );
}
