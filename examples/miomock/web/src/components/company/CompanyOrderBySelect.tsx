import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import {
  CompanyOrderBy,
  CompanyOrderByLabel,
} from "src/services/sonamu.generated";

export type CompanyOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function CompanyOrderBySelect({
  placeholder,
  textPrefix,
  ...props
}: CompanyOrderBySelectProps) {
  const typeOptions = CompanyOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + CompanyOrderByLabel[key],
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
