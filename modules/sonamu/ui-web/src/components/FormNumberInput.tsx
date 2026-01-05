import { Input, type InputProps } from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";

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
  const [str, setStr] = useState<string>("");

  useEffect(() => {
    if (Number((str ?? "").replace(/[.]/g, "")) !== propValue) {
      setStr(String(propValue ?? ""));
    }
  }, [propValue, str]);

  return (
    <Input
      type={inputType ?? "text"}
      inputMode="numeric"
      {...props}
      value={str}
      onChange={(e) => {
        if (onChange) {
          const newValue = e.target.value;
          setStr(newValue);
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
