import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { DepartmentSearchFieldLabel } from "src/services/sonamu.generated";

export function DepartmentSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(DepartmentSearchFieldLabel).map(
    ([key, label]) => {
      return {
        key,
        value: key,
        text: "검색: " + label,
      };
    },
  );
  return <Dropdown className="label" options={options} {...props} />;
}
