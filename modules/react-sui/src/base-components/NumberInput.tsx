import { useState } from "react";
import { Input } from "semantic-ui-react";
import { type InputProps } from "semantic-ui-react";

export function NumberInput({
  inputType,
  onChange,
  ...props
}: InputProps & {
  inputType?: "text" | "number";
  onChange?: (event: React.ChangeEvent<HTMLInputElement>, data: { value: number | "" }) => void;
}) {
  const [inputState, setInputState] = useState(() => ({
    externalValue: props.value,
    text: String(props.value ?? ""),
  }));

  // 외부 값이 바뀌면 동등한 사용자 입력 표현은 유지하고 실제 변경만 반영한다.
  if (inputState.externalValue !== props.value) {
    setInputState({
      externalValue: props.value,
      text:
        Number(inputState.text.replace(/[.]/g, "")) === props.value
          ? inputState.text
          : String(props.value ?? ""),
    });
  }

  return (
    <Input
      type={inputType ?? "text"}
      inputMode="numeric"
      {...props}
      value={inputState.text}
      onChange={(e, data) => {
        if (onChange) {
          setInputState({ externalValue: props.value, text: data.value });
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
