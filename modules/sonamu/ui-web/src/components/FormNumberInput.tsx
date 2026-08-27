import { Input } from "@sonamu-kit/react-components";
import { type InputProps } from "@sonamu-kit/react-components";
import { useState } from "react";

type FormNumberInputProps = Omit<InputProps, "onChange" | "type"> & {
  inputType?: "text" | "number";
  onChange?: (event: React.ChangeEvent<HTMLInputElement>, data: { value: number | "" }) => void;
  value?: number | string;
};

export function FormNumberInput({
  inputType,
  onChange,
  value: propValue,
  ...props
}: FormNumberInputProps) {
  const [editedValue, setEditedValue] = useState<{
    origin: number | string | undefined;
    value: string;
  }>();
  const str =
    editedValue !== undefined && editedValue.origin === propValue
      ? editedValue.value
      : String(propValue ?? "");

  return (
    <Input
      type={inputType ?? "text"}
      inputMode="numeric"
      {...props}
      value={str}
      onChange={(e) => {
        if (onChange) {
          const newValue = e.target.value;
          setEditedValue({ origin: propValue, value: newValue });
          if (newValue === "-") {
            return;
          }
          return onChange(e, {
            value: newValue === "" ? "" : Number(newValue.replace(/[^0-9.-]/g, "")),
          });
        }
      }}
    />
  );
}
