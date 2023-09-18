import classNames from "classnames";
import { useEffect, useState } from "react";
import { Input, InputProps } from "semantic-ui-react";

type EditableInputProps = Omit<InputProps, "onChange"> & {
  value: string;
  onChange: (
    e: React.KeyboardEvent<HTMLInputElement>,
    data: { value: string }
  ) => Promise<void>;
};
export function EditableInput({
  onChange,
  value: originValue,
  ...inputProps
}: EditableInputProps) {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<string>(inputProps.originValue);

  useEffect(() => {
    if (value !== originValue) {
      setValue(originValue);
    }
  }, [originValue]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      if (value === originValue) {
        return;
      }
      setLoading(true);
      onChange(event, { value: event.currentTarget.value }).finally(() => {
        setLoading(false);
      });
    } else if (event.key === "Escape") {
      setValue(originValue);
    }
  };

  return (
    <Input
      {...inputProps}
      loading={loading}
      onKeyDown={handleKeyDown}
      value={value ?? ""}
      onChange={(_e, data) => setValue(data.value)}
      className={classNames("editable-input", {
        "is-dirty": !!originValue && originValue !== value,
      })}
    />
  );
}
