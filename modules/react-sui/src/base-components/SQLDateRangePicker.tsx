import { DateTime } from "luxon";
import type React from "react";
import { type ReactNode } from "react";
import SemanticDatepicker from "react-semantic-ui-datepickers";
import { z } from "zod";

import "react-semantic-ui-datepickers/dist/react-semantic-ui-datepickers.css";
import { type SQLDateTimeString } from "../helpers/shared";

export type SQLDateRangePickerProps = {
  label?: string | ReactNode;
  value?: SQLDateTimeString[];
  onChange?: (
    e: React.SyntheticEvent<Element> | undefined,
    data: { value: SQLDateTimeString[] },
  ) => void;
};
export function SQLDateRangePicker({ label, value, onChange, ...props }: SQLDateRangePickerProps) {
  const labelText = z.string().safeParse(label);

  return (
    <div className="semantic-datepicker-wrapper">
      {labelText.success ? <div className="label">{labelText.data}</div> : label}
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
                  return data.value.map((v) => DateTime.fromJSDate(v).toSQL()?.slice(0, 10) ?? "");
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
