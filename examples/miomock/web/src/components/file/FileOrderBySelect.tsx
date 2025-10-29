import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { FileOrderBy, FileOrderByLabel } from "src/services/sonamu.generated";

export type FileOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function FileOrderBySelect({
  placeholder,
  textPrefix,
  ...props
}: FileOrderBySelectProps) {
  const typeOptions = FileOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + FileOrderByLabel[key],
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
