import { isNil } from "lodash";
import { DateTime } from "luxon";
import React, { ReactNode } from "react";
import SemanticDatepicker from "react-semantic-ui-datepickers";
import "react-semantic-ui-datepickers/dist/react-semantic-ui-datepickers.css";
import { SQLDateTimeString } from "../helpers/shared";

export type SQLDateRangePickerProps = {
  label?: string | ReactNode;
  value?: SQLDateTimeString[];
  onChange?: (
    e: React.SyntheticEvent<Element, Event> | undefined,
    data: { value: SQLDateTimeString[] }
  ) => void;
};
export function SQLDateRangePicker({
  label,
  value,
  onChange,
  ...props
}: SQLDateRangePickerProps) {
  return (
    <div className="semantic-datepicker-wrapper">
      {typeof label === "string" ? <div className="label">{label}</div> : label}
      <SemanticDatepicker
        locale="ko-KR"
        type="range"
        value={value ? value.map((v) => DateTime.fromSQL(v).toJSDate()) : []}
        onChange={(e, data) => {
          if (onChange) {
            onChange(e, {
              ...data,
              value: (() => {
                if (Array.isArray(data.value)) {
                  return data.value.map((v) =>
                    DateTime.fromJSDate(v).toSQL().slice(0, 10)
                  );
                } else {
                  return [];
                }
              })(),
            });
          }
        }}
        {...props}
      />
    </div>
  );
}
