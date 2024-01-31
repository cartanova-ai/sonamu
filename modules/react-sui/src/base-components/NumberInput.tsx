import { useEffect, useState } from "react";
import { InputProps, Input } from "semantic-ui-react";

export function NumberInput({
  inputType,
  onChange,
  ...props
}: InputProps & {
  inputType?: "text" | "number";
  onChange?: (
    event: React.ChangeEvent<HTMLInputElement>,
    data: { value: number | "" }
  ) => void;
}) {
  const [str, setStr] = useState<string>("");

  useEffect(() => {
    if (Number(str.replace(/[.]/g, "")) !== props.value) {
      setStr(props.value);
    }
  }, [props.value]);

  return (
    <Input
      type={inputType ?? "text"}
      inputMode="numeric"
      {...props}
      value={str}
      onChange={(e, data) => {
        if (onChange) {
          setStr(data.value);
          return onChange(e, {
            ...data,
            value:
              data.value === ""
                ? ""
                : Number(data.value.replace(/[^0-9.]/g, "")),
          });
        }
      }}
    />
  );
}
