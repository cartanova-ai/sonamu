import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import {
  DepartmentOrderBy,
  DepartmentOrderByLabel,
} from "src/services/sonamu.generated";

export type DepartmentOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function DepartmentOrderBySelect({
  placeholder,
  textPrefix,
  ...props
}: DepartmentOrderBySelectProps) {
  const typeOptions = DepartmentOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + DepartmentOrderByLabel[key],
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
