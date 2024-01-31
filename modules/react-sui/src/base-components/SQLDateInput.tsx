import { isNil } from "lodash-es";
import { DateTime } from "luxon";
import { InputProps, Input } from "semantic-ui-react";

export function SQLDateInput(
  props: InputProps & {
    onChange?: (
      event: React.ChangeEvent<HTMLInputElement>,
      data: { value: string }
    ) => void;
  }
) {
  return (
    <Input
      type="date"
      {...props}
      value={
        isNil(props.value) || props.value === ""
          ? ""
          : DateTime.fromSQL(props.value).toISODate()
      }
      onChange={(e, data) => {
        if (props.onChange) {
          return props.onChange(e, {
            ...data,
            value:
              data.value === ""
                ? ""
                : DateTime.fromISO(data.value).toSQLDate() ?? "",
          });
        }
      }}
    />
  );
}
