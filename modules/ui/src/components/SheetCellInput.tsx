import { useEffect, useState } from "react";
import { Input } from "semantic-ui-react";

type SheetCellInputProps = {
  editable: boolean;
  initialValue: string;
  onChange: (value: string) => void;
};
export function SheetCellInput({
  editable,
  initialValue,
  onChange,
}: SheetCellInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };
  const handleOnKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onChange(value);
    } else if (e.key === "Escape") {
      setValue(initialValue);
      onChange(initialValue);
    }
    e.stopPropagation();
  };

  useEffect(() => {
    if (editable) {
      setTimeout(() => {
        const input = document.querySelector(
          `.sheet-cell-input input`
        ) as HTMLInputElement;
        input?.focus();
      });
    }
  }, [editable]);

  return (
    <>
      {editable ? (
        <Input
          value={value}
          onChange={handleOnChange}
          onKeyDown={handleOnKeyDown}
          className="sheet-cell-input"
        />
      ) : (
        <>{initialValue}&nbsp;</>
      )}
    </>
  );
}
