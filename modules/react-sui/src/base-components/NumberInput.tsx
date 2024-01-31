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
  return (
    <Input
      type={inputType ?? "text"}
      inputMode="numeric"
      {...props}
      onChange={(e, data) => {
        if (data.value && data.value !== "" && data.value.endsWith(".")) {
          return;
        }
        if (onChange) {
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
