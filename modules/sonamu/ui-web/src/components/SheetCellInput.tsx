import { Input } from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";

type SheetCellInputProps = {
  editable: boolean;
  initialValue: string;
  onChange: (value: string) => void;
};
export function SheetCellInput({ editable, initialValue, onChange }: SheetCellInputProps) {
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
        const input = document.querySelector<HTMLInputElement>(`.sheet-cell-input input`);
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
          className="sheet-cell-input [&>input]:p-[0.2em_0.4em]"
        />
      ) : (
        <>{initialValue}&nbsp;</>
      )}
    </>
  );
}
