import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { FileSearchFieldLabel } from "src/services/sonamu.generated";

export function FileSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(FileSearchFieldLabel).map(([key, label]) => {
    return {
      key,
      value: key,
      text: "검색: " + label,
    };
  });
  return <Dropdown className="label" options={options} {...props} />;
}
