import { format } from "date-fns";

import { type Override } from "../../lib/types";
import { Input } from "./input";

type DateInputProps = Override<
  React.ComponentProps<"input">,
  {
    value: Date | null;
    onValueChange: (value: Date | null) => void;
  }
>;
function DateInput({ value, onValueChange, ...props }: DateInputProps) {
  // 입력과 같은 현지 시각 기준으로 표시해 수정 시 시차가 생기지 않게 합니다.
  const dateValue = !value
    ? ""
    : format(value instanceof Date ? value : new Date(value), "yyyy-MM-dd'T'HH:mm");

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
