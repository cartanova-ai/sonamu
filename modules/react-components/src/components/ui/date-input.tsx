import type { Override } from "../../lib/types";
import { Input } from "./input";

type DateInputProps = Override<
  React.ComponentProps<"input">,
  {
    value: Date | null;
    onValueChange: (value: Date | null) => void;
  }
>;
function DateInput({ value, onValueChange, ...props }: DateInputProps) {
  // value가 문자열이거나 빈 문자열인 경우 처리
  const dateValue = !value
    ? ""
    : value instanceof Date
      ? value.toISOString().slice(0, 16)
      : new Date(value).toISOString().slice(0, 16);

  return (
    <Input
      type="datetime-local"
      value={dateValue}
      onChange={(e) => onValueChange(e.target.value ? new Date(e.target.value) : null)}
      {...props}
    />
  );
}

export { DateInput, type DateInputProps };
