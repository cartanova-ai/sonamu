import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { UserSearchFieldLabel } from "src/services/sonamu.generated";

export function UserSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(UserSearchFieldLabel).map(([key, label]) => {
    return {
      key,
      value: key,
      text: "검색: " + label,
    };
  });
  return <Dropdown className="label" options={options} {...props} />;
}
