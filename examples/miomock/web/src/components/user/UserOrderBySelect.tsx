import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { UserOrderBy, UserOrderByLabel } from "src/services/sonamu.generated";

export type UserOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function UserOrderBySelect({
  placeholder,
  textPrefix,
  ...props
}: UserOrderBySelectProps) {
  const typeOptions = UserOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + UserOrderByLabel[key],
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
