import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import {
  ProjectOrderBy,
  ProjectOrderByLabel,
} from "src/services/sonamu.generated";

export type ProjectOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function ProjectOrderBySelect({
  placeholder,
  textPrefix,
  ...props
}: ProjectOrderBySelectProps) {
  const typeOptions = ProjectOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + ProjectOrderByLabel[key],
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
