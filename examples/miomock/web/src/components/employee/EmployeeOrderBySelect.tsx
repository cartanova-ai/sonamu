import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import {
  EmployeeOrderBy,
  EmployeeOrderByLabel,
} from "src/services/sonamu.generated";

export type EmployeeOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function EmployeeOrderBySelect({
  placeholder,
  textPrefix,
  ...props
}: EmployeeOrderBySelectProps) {
  const typeOptions = EmployeeOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + EmployeeOrderByLabel[key],
  }));

  return (
    <Dropdown
      placeholder={placeholder ?? "정렬"}
      selection
      options={typeOptions}
      selectOnBlur={false}
      {...props}
    />
  );
}
