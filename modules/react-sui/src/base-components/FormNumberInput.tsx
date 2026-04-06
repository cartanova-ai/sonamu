import { useEffect, useState } from "react";
import { Form, type FormInputProps } from "semantic-ui-react";

export function FormNumberInput({
  inputType,
  onChange,
  ...props
}: FormInputProps & {
  inputType?: "text" | "number";
  onChange?: (event: React.ChangeEvent<HTMLInputElement>, data: { value: number | "" }) => void;
}) {
  const [str, setStr] = useState("");

  useEffect(() => {
    if (Number((str ?? "").replace(/[.]/g, "")) !== props.value) {
      setStr(String(props.value ?? ""));
    }
  }, [props.value]);

  return (
    <Form.Input
      type={inputType ?? "text"}
      inputMode="numeric"
      {...props}
      value={str}
      onChange={(e, data) => {
        if (onChange) {
          setStr(data.value);
          if (data.value === "-") {
            return;
          }
          return onChange(e, {
            ...data,
            value: data.value === "" ? "" : Number(data.value.replace(/[^0-9.-]/g, "")),
          });
        }
      }}
    />
  );
}
