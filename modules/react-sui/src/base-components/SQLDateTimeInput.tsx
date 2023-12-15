import { isNil } from "lodash";
import { DateTime } from "luxon";
import { InputProps, Input } from "semantic-ui-react";

export function SQLDateTimeInput(
  props: InputProps & {
    onChange?: (
      event: React.ChangeEvent<HTMLInputElement>,
      data: { value: string }
    ) => void;
  }
) {
  return (
    <Input
      type="datetime-local"
      {...props}
      value={
        isNil(props.value) || props.value === ""
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
              data.value === ""
                ? ""
                : DateTime.fromISO(data.value).toSQL()!.slice(0, 19),
          });
        }
      }}
    />
  );
}
