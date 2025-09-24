import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import {
  ProjectStatus,
  ProjectStatusLabel,
} from "src/services/sonamu.generated";

export type ProjectStatusSelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function ProjectStatusSelect({
  placeholder,
  textPrefix,
  ...props
}: ProjectStatusSelectProps) {
  const typeOptions = ProjectStatus.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "상태: ") + ProjectStatusLabel[key],
  }));

  return (
    <Dropdown
      placeholder={placeholder ?? "상태"}
      selection
      options={typeOptions}
      selectOnBlur={false}
      {...props}
    />
  );
}
