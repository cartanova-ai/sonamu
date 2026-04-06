import { DateTime } from "luxon";
import { Input } from "semantic-ui-react";
import type { InputProps } from "semantic-ui-react";

export function SQLDateInput(
  props: InputProps & {
    onChange?: (event: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => void;
  },
) {
  return (
    <Input
      type="date"
      {...props}
      value={
        props.value === null || props.value === undefined || props.value === ""
          ? ""
          : DateTime.fromSQL(props.value).toISODate()
      }
      onChange={(e, data) => {
        if (props.onChange) {
          return props.onChange(e, {
            ...data,
            value: data.value === "" ? "" : (DateTime.fromISO(data.value).toSQLDate() ?? ""),
          });
        }
      }}
    />
  );
}
