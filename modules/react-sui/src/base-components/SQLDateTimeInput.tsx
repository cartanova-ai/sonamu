import { DateTime } from "luxon";
import { Input } from "semantic-ui-react";
import { type InputProps } from "semantic-ui-react";

export function SQLDateTimeInput(
  props: InputProps & {
    onChange?: (event: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => void;
  },
) {
  return (
    <Input
      type="datetime-local"
      {...props}
      value={
        props.value === null || props.value === undefined || props.value === ""
          ? ""
          : DateTime.fromSQL(props.value).toISO({
              includeOffset: false,
            })
      }
      onChange={(e, data) => {
        if (props.onChange) {
          return props.onChange(e, {
            ...data,
            value:
              data.value === "" ? "" : (DateTime.fromISO(data.value).toSQL()?.slice(0, 19) ?? ""),
          });
        }
      }}
    />
  );
}
