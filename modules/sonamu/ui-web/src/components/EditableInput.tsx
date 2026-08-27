import { Input } from "@sonamu-kit/react-components";
import { type InputProps } from "@sonamu-kit/react-components";
import classNames from "classnames";
import { useState } from "react";

type EditableInputProps = Omit<InputProps, "onChange"> & {
  value: string;
  onChange: (e: React.KeyboardEvent<HTMLInputElement>, data: { value: string }) => Promise<void>;
};
export function EditableInput({ onChange, value: originValue, ...inputProps }: EditableInputProps) {
  const [loading, setLoading] = useState(false);
  const [editedValue, setEditedValue] = useState<{ origin: string; value: string }>();
  const value = editedValue?.origin === originValue ? editedValue.value : originValue;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      if (value === originValue) {
        return;
      }
      setLoading(true);
      onChange(event, { value: event.currentTarget.value }).finally(() => {
        setLoading(false);
      });
    } else if (event.key === "Escape") {
      setEditedValue(undefined);
    }
  };

  return (
    <Input
      {...inputProps}
      onKeyDown={handleKeyDown}
      value={value ?? ""}
      onValueChange={(nextValue) => setEditedValue({ origin: originValue, value: nextValue })}
      className={classNames({
        "border-red-500! bg-[rgb(255,217,217)]!": !!originValue && originValue !== value,
        "opacity-50": loading,
      })}
    />
  );
}
